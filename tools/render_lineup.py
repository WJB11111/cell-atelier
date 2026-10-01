"""Render every specimen on one shared scale, for the same-scale lineup.

    blender --background --factory-startup --python tools/render_lineup.py -- \
        animal-cell.blend membrane 20 public/lineup/animal-cell.png

The frame is built so that the declared structure's *projected* width is exactly
``real`` micrometres, at one fixed pixels-per-micron for every specimen. That is
what makes the images comparable: each one is cropped to its own cell, so the
pixel width of an image is the real width of the cell it shows, and the page can
line them up on a single ground line without scaling anything.

Orthographic, transparent, and lit by the shared studio so the lineup matches the
rest of the site's renders.
"""

from __future__ import annotations

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
#: air around each cell, as a fraction of its own width. The frame is still
#: exactly ``real * PIXELS_PER_MICRON`` pixels wide, so the cell occupies
#: 1/MARGIN of it and the page needs no extra bookkeeping: one micrometre stays
#: PIXELS_PER_MICRON/MARGIN pixels inside the image.
MARGIN = 1.24
#: air above a cell, relative to its own height; the bottom is flush, so every
#: image stands on its own bottom edge and the row lines up on one ground line
TOP_MARGIN = 1.14
#: structures that belong to the named one and follow its highlight
AUXILIARY = {"nucleolus"}
#: Specimens whose declared structure is only part of the model. A real axon is a
#: thousand times its soma and a flagellum some ten times its head, so drawing the
#: whole cell at true scale would leave the measured part a speck. These render the
#: measured part alone — a complete cell in frame, with the page's caption saying
#: what was left out.
CROP_TO_STRUCTURE = {
    "neuron": {"soma", "nucleus", "nucleolus"},
    "sperm-cell": {"nucleus", "acrosome"},
}
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
    keep = CROP_TO_STRUCTURE.get(specimen)
    if keep:
        # hide the parts that would otherwise run off the frame, so the picture
        # shows one whole cell rather than a slice of one
        for obj in bpy.context.scene.objects:
            if obj.type == "MESH" and obj.get("organelle") not in keep:
                obj.hide_render = True

    objects = structure_objects(structure)
    if not objects:
        raise SystemExit(f"{blend}: no mesh tagged as {structure}")

    # every vertex of the declared structure, in world space
    points = []
    for obj in objects:
        matrix = obj.matrix_world
        points.extend(matrix @ vertex.co for vertex in obj.data.vertices)
    centre = sum(points, Vector((0, 0, 0))) / len(points)

    studio.configure(bpy.context.scene, samples=56, transparent=True, world_strength=0.42)
    data = bpy.data.cameras.new("LineupCamera")
    data.type = "ORTHO"
    camera = bpy.data.objects.new("LineupCamera", data)
    bpy.context.scene.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    direction = Vector(VIEW_DIRECTIONS.get(specimen, DEFAULT_DIRECTION)).normalized()
    camera.location = centre + direction * 40.0
    camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    # Blender caches matrix_world: without this the projection below is computed
    # against a stale matrix and the centring correction is applied along the
    # world axes instead of the camera's. That silently aimed the neuron's frame at
    # its myelin sheath, three units away from the soma.
    bpy.context.view_layer.update()

    # project the structure into camera space: the frame has to match what is
    # actually seen, not the axis-aligned box that a three-quarter view foreshortens
    inverse = camera.matrix_world.inverted()
    viewed = [inverse @ point for point in points]
    low = Vector((min(p.x for p in viewed), min(p.y for p in viewed), 0.0))
    high = Vector((max(p.x for p in viewed), max(p.y for p in viewed), 0.0))
    span = high - low
    if span.x <= 0:
        raise SystemExit(f"{blend}: {structure} projects to nothing")

    # the projected width is the declared real size, plus the margin; everything
    # else follows. sensor_fit keeps ortho_scale meaning the frame *width*, which
    # it would otherwise stop doing the moment an image is taller than it is wide.
    scene = bpy.context.scene
    data.sensor_fit = "HORIZONTAL"
    data.ortho_scale = span.x * MARGIN
    scene.render.resolution_x = max(32, round(real * PIXELS_PER_MICRON))
    scene.render.resolution_y = max(32, round(real * PIXELS_PER_MICRON * span.y * TOP_MARGIN / span.x))

    # Lay the cell on the bottom edge of the frame and give it air above and to the
    # sides. A uniform margin would leave the small cells floating higher than the
    # large ones, and the row is supposed to stand on one ground line.
    frame_height = data.ortho_scale * scene.render.resolution_y / scene.render.resolution_x
    camera_shift = camera.matrix_world.to_3x3() @ Vector((
        (low.x + high.x) / 2,
        (low.y + high.y) / 2 - (-frame_height / 2 + span.y),
        0.0,
    ))
    camera.location -= camera_shift
    bpy.context.view_layer.update()

    studio._add_light(scene, "Key", camera.location + Vector((-3.4, 4.2, 3.0)), centre, 2.3, 4.0)
    studio._add_light(scene, "Fill", camera.location + Vector((4.6, 1.4, -1.2)), centre, 0.55, 6.0, (0.86, 0.88, 1.0))
    studio._add_light(scene, "Rim", centre + Vector((0, 6.0, 2.6)), centre, 0.75, 5.0, (1.0, 0.94, 0.9))

    studio.render(scene, ROOT / target, label=f"{structure} {real:g}µm {scene.render.resolution_x}x{scene.render.resolution_y}")


if __name__ == "__main__":
    main()
