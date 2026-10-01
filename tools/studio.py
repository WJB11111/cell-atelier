"""Shared Cycles studio setup for the preview, thumbnail and gallery renders.

All three renderers open a ``.blend`` (or use the scene just built by a
``build_*.py`` script) and then call :func:`configure` and :func:`aim_camera`,
so every image in the repository is lit the same way.
"""

from __future__ import annotations

import math

import bpy
from mathutils import Vector

DEFAULT_SIZE = 768
DEFAULT_SAMPLES = 40


def scene_bounds(objects=None):
    """World-space bounds of the mesh objects in the current scene."""
    points = []
    for obj in objects or bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            points.append(obj.matrix_world @ Vector(corner))
    if not points:
        return Vector((0, 0, 0)), 1.0
    low = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    high = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return (low + high) / 2, (high - low).length / 2


def configure(
    scene,
    *,
    size: int = DEFAULT_SIZE,
    samples: int = DEFAULT_SAMPLES,
    transparent: bool = False,
    world_color=(0.93, 0.92, 0.89),
    world_strength: float = 0.32,
    floor: bool = False,
    floor_z: float = -3.05,
):
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

    world = bpy.data.worlds.new("StudioWorld")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (*world_color, 1.0)
    background.inputs["Strength"].default_value = world_strength

    if floor and not transparent:
        bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, floor_z))
        plane = bpy.context.active_object
        material = bpy.data.materials.new("StudioFloor")
        material.use_nodes = True
        bsdf = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = (0.88, 0.87, 0.84, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.85
        plane.data.materials.append(material)


def _add_light(scene, name, location, target, irradiance, size_hint, color=(1.0, 0.97, 0.92)):
    """Area light whose power follows the inverse-square law, so framing is stable."""
    data = bpy.data.lights.new(name, "AREA")
    data.size = size_hint
    data.color = color
    light = bpy.data.objects.new(name, data)
    scene.collection.objects.link(light)
    light.location = Vector(location)
    light.rotation_euler = (Vector(target) - light.location).normalized().to_track_quat("-Z", "Y").to_euler()
    distance = (Vector(target) - light.location).length
    data.energy = 4 * math.pi * distance * distance * irradiance
    return light


def aim_camera(scene, direction=(0.42, -0.72, 0.55), target=None, *, margin: float = 1.28, lens: float = 52.0):
    """Place a camera along ``direction``, framed on the current scene bounds."""
    centre, radius = scene_bounds()
    if target is None:
        target = centre
    target = Vector(target)
    direction = Vector(direction).normalized()

    data = bpy.data.cameras.new("StudioCamera")
    data.lens = lens
    camera = bpy.data.objects.new("StudioCamera", data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    half_angle = math.atan((data.sensor_width / 2) / lens)
    distance = (radius * margin) / math.tan(half_angle)
    camera.location = target + direction * distance
    camera.rotation_euler = (target - camera.location).normalized().to_track_quat("-Z", "Y").to_euler()

    span = max(4.0, distance)
    _add_light(scene, "Key", camera.location + Vector((-3.4, 4.2, 3.0)), target, 2.3, 4.0)
    _add_light(scene, "Fill", camera.location + Vector((4.6, 1.4, -1.2)), target, 0.55, 6.0, (0.86, 0.88, 1.0))
    _add_light(scene, "Rim", target + Vector((0, 6.0, 2.6)), target, 0.75, 5.0, (1.0, 0.94, 0.9))
    return camera, centre, radius, span


def render(scene, path, *, label: str = "") -> None:
    from pathlib import Path

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print(f"[studio] rendered {path} {label}".rstrip())
