"""Headless studio preview renderer used while iterating on the models.

Run it after a build script in the same Blender process::

    blender --background --factory-startup \
        --python build_animal_detailed.py --python tools/render_preview.py -- \
        out.png 3.6 6.5 8.8 --size 768 --samples 40

Arguments after ``--``: output path, camera x y z, optional ``--target x y z``,
``--size``, ``--samples`` and ``--transparent``.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def flag(name, default=None):
    """Three consecutive values after ``name`` (used for --target)."""
    if name in argv:
        index = argv.index(name)
        return argv[index + 1 : index + 4] if default is None else argv[index + 1]
    return default


def value(name, default=None):
    """Single value after ``name``."""
    return argv[argv.index(name) + 1] if name in argv else default


output = Path(argv[0]) if argv else Path("preview.png")
camera_at = Vector([float(v) for v in argv[1:4]]) if len(argv) >= 4 else Vector((4.6, 6.4, 8.6))
target = Vector([float(v) for v in flag("--target", ["0", "0", "0"])])
size = int(value("--size", "768"))
samples = int(value("--samples", "40"))
transparent = "--transparent" in argv

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = samples
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
scene.render.resolution_x = size
scene.render.resolution_y = size
scene.render.resolution_percentage = 100
scene.render.film_transparent = transparent
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0.0

world = bpy.data.worlds.new("PreviewWorld")
scene.world = world
world.use_nodes = True
background = world.node_tree.nodes["Background"]
background.inputs["Color"].default_value = (0.93, 0.92, 0.89, 1.0)
background.inputs["Strength"].default_value = 0.32


def add_light(name, location, irradiance, size_hint, color=(1.0, 0.97, 0.92)):
    """Energy is derived from the inverse-square law so framing never blows out."""
    data = bpy.data.lights.new(name, "AREA")
    data.size = size_hint
    data.color = color
    light = bpy.data.objects.new(name, data)
    scene.collection.objects.link(light)
    light.location = Vector(location)
    direction = (target - light.location).normalized()
    light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    distance = (target - light.location).length
    data.energy = 4 * math.pi * distance * distance * irradiance
    return light


span = max(4.0, (camera_at - target).length)
add_light("Key", (camera_at.x - 3.5, camera_at.y + 4.5, camera_at.z + 3.0), 2.4, 4.0)
add_light("Fill", (camera_at.x + 5.0, camera_at.y + 1.5, camera_at.z - 1.0), 0.55, 6.0, (0.86, 0.88, 1.0))
add_light("Rim", (0.0, -6.0, 2.5), 0.8, 5.0, (1.0, 0.94, 0.9))

camera_data = bpy.data.cameras.new("PreviewCamera")
camera_data.lens = 52
camera = bpy.data.objects.new("PreviewCamera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera

# a soft floor makes the model read as an object rather than a floating blob
if not transparent:
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -3.05))
    floor = bpy.context.active_object
    material = bpy.data.materials.new("Floor")
    material.use_nodes = True
    bsdf = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.88, 0.87, 0.84, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.85
    floor.data.materials.append(material)

shots = value("--shots")
if shots:
    positions = []
    for shot in shots.split(";"):
        position, _, aim = shot.partition("@")
        positions.append(
            (
                Vector([float(v) for v in position.split(",")]),
                Vector([float(v) for v in aim.split(",")]) if aim else target,
            )
        )
else:
    positions = [(camera_at, target)]

output.parent.mkdir(parents=True, exist_ok=True)
for index, (position, aim) in enumerate(positions):
    camera.location = position
    camera.rotation_euler = (aim - position).normalized().to_track_quat("-Z", "Y").to_euler()
    path = output if len(positions) == 1 else output.with_name(f"{output.stem}-{index + 1}{output.suffix}")
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print(f"[preview] rendered {path} samples={samples} size={size} "
          f"camera={tuple(round(v, 2) for v in position)} fov={math.degrees(camera_data.angle):.1f}deg")
