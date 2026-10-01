"""Render every specimen on one shared scale, for the same-scale lineup.

    blender --background --factory-startup --python tools/render_lineup.py -- \
        animal-cell.blend membrane 20 public/lineup/animal-cell.png

Every picture is drawn to one fixed orthographic scale, and the declared
structure inside it is the ruler: its projected width *is* ``real`` micrometres.
The frame then holds the **whole** specimen, so a neuron arrives with its
processes and a sperm with its flagellum — complete cells, nothing sliced off.
That makes some pictures wider than the declared structure (a neuron is four
times its soma), so each render also writes a small JSON saying how many
micrometres wide the picture actually is, and the page sizes it by that.

Orthographic, transparent, and lit by the shared studio so the lineup matches the
rest of the site's renders.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import studio  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
#: pixels per micrometre, the same for every specimen
PIXELS_PER_MICRON = 11.0
#: air around each cell, as a fraction of its own width. The frame is exactly the
#: cell's real width times this, so one micrometre stays
#: PIXELS_PER_MICRON/MARGIN pixels inside the image.
MARGIN = 1.24
#: air above a cell, relative to its own height; the bottom is flush, so every
#: image stands on its own bottom edge and the row lines up on one ground line
TOP_MARGIN = 1.14
#: structures that belong to the named one and follow its highlight
AUXILIARY = {"nucleolus"}
#: The same three-quarter-from-above angles the catalogue thumbnails use. A
#: shallow side view turns the plant cell into a closed box and hides the section
#: opening; these show the inside, which is the whole reason the models are cut.
VIEW_DIRECTIONS = {
    "animal-cell": (0.34, -0.62, 0.70),
    "plant-cell": (0.36, -0.58, 0.72),
    "cyanobacterium": (0.24, -0.55, 0.80),
    "white-blood-cell": (0.30, -0.60, 0.74),
    "neuron": (0.22, -0.62, 0.75),
    "red-blood-cell": (0.26, -0.52, 0.82),
    "sperm-cell": (0.30, -0.64, 0.71),
}
DEFAULT_DIRECTION = (0.32, -0.60, 0.73)


def structure_objects(structure: str):
    wanted = {structure} | (AUXILIARY if structure == "nucleus" else set())
    return [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.get("organelle") in wanted
    ]


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:]
    blend, structure, real, target = argv[0], argv[1], float(argv[2]), Path(argv[3])
    specimen = Path(blend).stem

    bpy.ops.wm.open_mainfile(filepath=str(ROOT / blend))
    objects = structure_objects(structure)
    if not objects:
        raise SystemExit(f"{blend}: no mesh tagged as {structure}")

    def world_points(selection):
        return [
            obj.matrix_world @ vertex.co
            for obj in selection
            for vertex in obj.data.vertices
        ]

    # The declared structure is the ruler: its projected width *is* `real` µm. The
    # frame, though, holds the whole specimen — a neuron's processes and a sperm's
    # flagellum included — so the picture shows a complete cell rather than a slice
    # of one. Everything drawn therefore stays to scale; the extra width is real.
    declared_points = world_points(objects)
    every_mesh = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    all_points = world_points(every_mesh)
    declared = sum(declared_points, Vector((0, 0, 0))) / len(declared_points)
    whole = sum(all_points, Vector((0, 0, 0))) / len(all_points)

    studio.configure(bpy.context.scene, samples=56, transparent=True, world_strength=0.42)
    data = bpy.data.cameras.new("LineupCamera")
    data.type = "ORTHO"
    camera = bpy.data.objects.new("LineupCamera", data)
    bpy.context.scene.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    direction = Vector(VIEW_DIRECTIONS.get(specimen, DEFAULT_DIRECTION)).normalized()
    camera.location = whole + direction * 40.0
    camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    # Blender caches matrix_world: without this the projection below is computed
    # against a stale matrix and the centring correction is applied along the
    # world axes instead of the camera's. That silently aimed the neuron's frame at
    # its myelin sheath, three units away from the soma.
    bpy.context.view_layer.update()

    inverse = camera.matrix_world.inverted()
    declared_view = [inverse @ point for point in declared_points]
    all_view = [inverse @ point for point in all_points]

    def bounds(points):
        low = Vector((min(p.x for p in points), min(p.y for p in points), 0.0))
        high = Vector((max(p.x for p in points), max(p.y for p in points), 0.0))
        return low, high, high - low

    declared_low, declared_high, declared_span = bounds(declared_view)
    low, high, span = bounds(all_view)
    if declared_span.x <= 0 or span.x <= 0:
        raise SystemExit(f"{blend}: {structure} projects to nothing")

    # micrometres the picture spans: the declared width scaled up by however much
    # wider the whole specimen is
    microns = real * span.x / declared_span.x

    scene = bpy.context.scene
    data.sensor_fit = "HORIZONTAL"
    data.ortho_scale = span.x * MARGIN
    scene.render.resolution_x = max(48, round(microns * PIXELS_PER_MICRON))
    scene.render.resolution_y = max(48, round(microns * PIXELS_PER_MICRON * span.y * TOP_MARGIN / span.x))

    # Lay the specimen on the bottom edge of the frame, air above and to the sides.
    frame_height = data.ortho_scale * scene.render.resolution_y / scene.render.resolution_x
    camera.location -= camera.matrix_world.to_3x3() @ Vector((
        (low.x + high.x) / 2,
        (low.y + high.y) / 2 - (-frame_height / 2 + span.y),
        0.0,
    ))
    bpy.context.view_layer.update()

    # what the page needs in order to size the picture honestly
    target.with_suffix(".json").write_text(
        json.dumps({"id": specimen, "microns": round(microns, 2),
                    "declared": real, "structure": structure}, ensure_ascii=False),
        encoding="utf-8",
    )

    studio._add_light(scene, "Key", camera.location + Vector((-3.4, 4.2, 3.0)), whole, 2.3, 4.0)
    studio._add_light(scene, "Fill", camera.location + Vector((4.6, 1.4, -1.2)), whole, 0.55, 6.0, (0.86, 0.88, 1.0))
    studio._add_light(scene, "Rim", whole + Vector((0, 6.0, 2.6)), whole, 0.75, 5.0, (1.0, 0.94, 0.9))

    studio.render(scene, ROOT / target, label=f"{structure} {real:g}µm {scene.render.resolution_x}x{scene.render.resolution_y}")


if __name__ == "__main__":
    main()
