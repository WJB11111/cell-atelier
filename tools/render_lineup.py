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
PIXELS_PER_MICRON = 8.0
#: structures that belong to the named one and follow its highlight
AUXILIARY = {"nucleolus"}
#: the studio's three-quarter view, matching the thumbnails
VIEW_DIRECTION = Vector((0.42, -0.72, 0.55)).normalized()


def structure_objects(structure: str):
    wanted = {structure} | (AUXILIARY if structure == "nucleus" else set())
    return [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.get("organelle") in wanted
    ]


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:]
    blend, structure, real, target = argv[0], argv[1], float(argv[2]), Path(argv[3])

    bpy.ops.wm.open_mainfile(filepath=str(ROOT / blend))
    objects = structure_objects(structure)
    if not objects:
        raise SystemExit(f"{blend}: no mesh tagged as {structure}")

    # every vertex of the declared structure, in world space
    points = []
    for obj in objects:
        matrix = obj.matrix_world
        points.extend(matrix @ vertex.co for vertex in obj.data.vertices)
    centre = sum(points, Vector((0, 0, 0))) / len(points)

    studio.configure(bpy.context.scene, samples=36, transparent=True, world_strength=0.42)
    data = bpy.data.cameras.new("LineupCamera")
    data.type = "ORTHO"
    camera = bpy.data.objects.new("LineupCamera", data)
    bpy.context.scene.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    camera.location = centre + VIEW_DIRECTION * 40.0
    camera.rotation_euler = (-VIEW_DIRECTION).to_track_quat("-Z", "Y").to_euler()
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

    # the projected width is the declared real size; everything else follows
    scene = bpy.context.scene
    scene.render.resolution_x = max(24, round(real * PIXELS_PER_MICRON))
    scene.render.resolution_y = max(24, round(real * PIXELS_PER_MICRON * span.y / span.x))
    data.ortho_scale = span.x
    offset = camera.matrix_world.to_3x3() @ Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, 0.0))
    camera.location -= offset
    bpy.context.view_layer.update()

    studio._add_light(scene, "Key", camera.location + Vector((-3.4, 4.2, 3.0)), centre, 2.3, 4.0)
    studio._add_light(scene, "Fill", camera.location + Vector((4.6, 1.4, -1.2)), centre, 0.55, 6.0, (0.86, 0.88, 1.0))
    studio._add_light(scene, "Rim", centre + Vector((0, 6.0, 2.6)), centre, 0.75, 5.0, (1.0, 0.94, 0.9))

    studio.render(scene, ROOT / target, label=f"{structure} {real:g}µm {scene.render.resolution_x}x{scene.render.resolution_y}")


if __name__ == "__main__":
    main()
