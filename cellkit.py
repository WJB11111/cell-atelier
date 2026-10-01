"""Shared procedural geometry toolkit for the cell specimen build scripts.

Every build_*.py script imports this module. It only depends on ``bpy``,
``bmesh`` and the standard library, so it also runs inside a headless
``blender --background --python build_*.py`` session.

Conventions used by the web app
-------------------------------
* one Blender object per structure, tagged with the custom property
  ``obj['organelle'] = '<key>'``; the glTF exporter turns that into node
  ``extras`` and the viewer maps every mesh back to a selectable structure.
* closed teaching shells carry ``obj['wholeShell'] = True`` so the plant cell
  can fade them out without touching the cutaway model.
* meshes are merged per structure, keep box-projected UVs (the viewer uses them
  for its microtexture bump) and export with consistent outward normals.
"""

from __future__ import annotations

import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

TAU = math.tau
ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"

# --------------------------------------------------------------------------
# scene helpers
# --------------------------------------------------------------------------


def reset_scene() -> None:
    """Start from a completely empty file so a rebuild is reproducible."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for item in list(block):
            block.remove(item)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.render.engine = "CYCLES"


def srgb_to_linear(channel: float) -> float:
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def hex_rgb(value: str) -> tuple[float, float, float]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) / 255 for i in (0, 2, 4))


def material(
    name: str,
    color,
    *,
    roughness: float = 0.42,
    metallic: float = 0.0,
    alpha: float = 1.0,
    emission_strength: float = 0.0,
):
    """Principled material whose base colour matches the viewer palette."""
    rgb = hex_rgb(color) if isinstance(color, str) else tuple(color)
    linear = tuple(srgb_to_linear(c) for c in rgb)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*linear, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha
    if emission_strength and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (*linear, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    mat.diffuse_color = (*linear, alpha)
    mat.roughness = roughness
    return mat


def transform(location=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1)) -> Matrix:
    """Translate · rotate · scale matrix built from plain tuples."""
    if isinstance(scale, (int, float)):
        scale = (scale, scale, scale)
    return (
        Matrix.Translation(Vector(location))
        @ Euler(rotation, "XYZ").to_matrix().to_4x4()
        @ Matrix.Diagonal(Vector(scale).to_4d())
    )


def _recalc_normals(mesh) -> None:
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()


def _box_uvs(verts, faces, scale: float = 0.18):
    """Cheap box projection: enough for the viewer's procedural grain bump."""
    uv = []
    for face in faces:
        pts = [Vector(verts[i]) for i in face]
        normal = (pts[1] - pts[0]).cross(pts[2] - pts[0])
        axis = max(range(3), key=lambda i: abs(normal[i]))
        for p in pts:
            if axis == 0:
                uv.append((p.y * scale + 0.5, p.z * scale + 0.5))
            elif axis == 1:
                uv.append((p.x * scale + 0.5, p.z * scale + 0.5))
            else:
                uv.append((p.x * scale + 0.5, p.y * scale + 0.5))
    return uv


def new_object(name, verts, faces, mat=None, *, organelle=None, smooth=True, uvs=True,
               matrix: Matrix | None = None):
    """Create a mesh object from raw vertex/face lists."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    mesh.validate(verbose=False)
    mesh.update()
    if uvs and faces:
        layer = mesh.uv_layers.new(name="UVMap")
        flat = _box_uvs(verts, faces)
        if len(flat) == len(layer.data):
            for loop, co in zip(layer.data, flat):
                loop.uv = co
    if mat is not None:
        mesh.materials.append(mat)
    if smooth:
        for poly in mesh.polygons:
            poly.use_smooth = True
    _recalc_normals(mesh)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if matrix is not None:
        obj.matrix_world = matrix
    if organelle:
        obj["organelle"] = organelle
    return obj


def copy_object(source, matrix: Matrix, name: str | None = None, *, organelle=None):
    """Instance ``source`` (shared mesh data) at ``matrix``."""
    obj = bpy.data.objects.new(name or f"{source.name}_copy", source.data)
    bpy.context.collection.objects.link(obj)
    obj.matrix_world = matrix
    if organelle:
        obj["organelle"] = organelle
    return obj


def discard(obj):
    """Delete a temporary source object once its placed copies exist.

    Leaving it in the scene would export a second mesh under the same organelle
    key, which the viewer would draw on top of the first.
    """
    data = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if data.users == 0:
        bpy.data.meshes.remove(data)


def scatter(source, matrices, *, organelle=None, name=None):
    return [
        copy_object(source, m, f"{name or source.name}_{i:03d}", organelle=organelle)
        for i, m in enumerate(matrices)
    ]


# --------------------------------------------------------------------------
# deterministic noise / organic perturbation
# --------------------------------------------------------------------------


class Rng:
    """Small deterministic helper so every rebuild produces the same model."""

    def __init__(self, seed: int = 20260929):
        self._rng = random.Random(seed)

    def uniform(self, low, high):
        return self._rng.uniform(low, high)

    def point_in_ball(self, radius: float, min_radius: float = 0.0):
        while True:
            p = Vector(
                (
                    self._rng.uniform(-1, 1),
                    self._rng.uniform(-1, 1),
                    self._rng.uniform(-1, 1),
                )
            )
            d = p.length
            if d <= 1.0 and d * radius >= min_radius:
                return p * radius

    def rotation(self):
        return Euler(
            (
                self._rng.uniform(0, TAU),
                self._rng.uniform(0, TAU),
                self._rng.uniform(0, TAU),
            ),
            "XYZ",
        )


def value_noise(seed: int = 7):
    """Smooth 3D value noise in [-1, 1] built from a hashed lattice."""
    lattice = {}

    def at(ix, iy, iz):
        key = (ix, iy, iz)
        if key not in lattice:
            h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
            h &= 0xFFFFFFFF
            lattice[key] = (h / 0xFFFFFFFF) * 2 - 1
        return lattice[key]

    def smooth(t):
        return t * t * (3 - 2 * t)

    def noise(x, y, z):
        ix, iy, iz = math.floor(x), math.floor(y), math.floor(z)
        fx, fy, fz = smooth(x - ix), smooth(y - iy), smooth(z - iz)
        total = 0.0
        for dz in (0, 1):
            for dy in (0, 1):
                for dx in (0, 1):
                    w = (fx if dx else 1 - fx) * (fy if dy else 1 - fy) * (fz if dz else 1 - fz)
                    total += w * at(ix + dx, iy + dy, iz + dz)
        return total

    return noise


def displace(obj, amount: float, frequency: float = 1.4, seed: int = 7):
    """Push vertices along their normals with smooth noise (organic surfaces)."""
    noise = value_noise(seed)
    mesh = obj.data
    mesh.calc_loop_triangles()
    normals = [Vector((0, 0, 0)) for _ in mesh.vertices]
    for poly in mesh.polygons:
        for index in poly.vertices:
            normals[index] += poly.normal
    for vertex, normal in zip(mesh.vertices, normals):
        if normal.length < 1e-9:
            continue
        co = vertex.co
        n = noise(co.x * frequency, co.y * frequency, co.z * frequency)
        vertex.co = co + normal.normalized() * (n * amount)
    mesh.update()
    return obj


# --------------------------------------------------------------------------
# primitives — every generator returns (verts, faces)
# --------------------------------------------------------------------------


def uv_sphere(radius: float = 1.0, segments: int = 48, rings: int = 24):
    verts = [(0.0, 0.0, radius)]
    for j in range(1, rings):
        phi = math.pi * j / rings
        z, r = radius * math.cos(phi), radius * math.sin(phi)
        for i in range(segments):
            t = TAU * i / segments
            verts.append((r * math.cos(t), r * math.sin(t), z))
    bottom = len(verts)
    verts.append((0.0, 0.0, -radius))
    faces = [(0, 1 + i, 1 + (i + 1) % segments) for i in range(segments)]
    for j in range(rings - 2):
        for i in range(segments):
            a = 1 + j * segments + i
            b = 1 + j * segments + (i + 1) % segments
            faces.append((a, a + segments, b + segments, b))
    base = 1 + (rings - 2) * segments
    for i in range(segments):
        a, b = base + i, base + (i + 1) % segments
        faces.append((a, bottom, b))
    return verts, faces


def superellipsoid(size=(1, 1, 1), exponent: float = 0.32, segments: int = 64, rings: int = 32):
    """Rounded box used for plant cells and their shells.

    The rings are spaced uniformly in the lateral radius rather than in the polar
    angle: a boxy exponent compresses most of the flat top face into the last
    polar step, which would otherwise collapse it into a spike.
    """
    a, b, c = size[0] / 2, size[1] / 2, size[2] / 2
    power = 2.0 / exponent

    def sp(t, p):
        return math.copysign(abs(t) ** p, t) if t else 0.0

    verts = [(0.0, 0.0, -c)]
    for j in range(1, rings):
        u = j / rings
        height = (max(0.0, 1.0 - u**power)) ** (exponent / 2)
        for i in range(segments):
            t = TAU * i / segments
            verts.append((a * u * sp(math.cos(t), exponent), b * u * sp(math.sin(t), exponent), -c * height))
    top = len(verts)
    verts.append((0.0, 0.0, c))
    faces = [(0, 1 + i, 1 + (i + 1) % segments) for i in range(segments)]
    for j in range(rings - 2):
        for i in range(segments):
            p = 1 + j * segments + i
            q = 1 + j * segments + (i + 1) % segments
            faces.append((p, q, q + segments, p + segments))
    base = 1 + (rings - 2) * segments
    for i in range(segments):
        p, q = base + i, base + (i + 1) % segments
        faces.append((p, top, q))
    return verts, faces


def rounded_box(size=(1, 1, 1), radius: float = 0.35, segments: int = 64, rings: int = 32):
    """True rounded box: a box with spherical corners, sampled like a sphere.

    Each vertex of a UV sphere is pushed out to the surface of the box along its
    own direction, solved with a short bisection on the rounded-box distance
    field. Unlike a superellipsoid this keeps the faces genuinely flat, which is
    what a plant cell envelope needs.
    """
    a, b, c = size[0] / 2, size[1] / 2, size[2] / 2
    r = max(1e-3, min(radius, min(a, b, c) * 0.95))
    half = Vector((a - r, b - r, c - r))
    reach = max(a, b, c) + r

    def inside(p):
        q = (abs(p.x) - half.x, abs(p.y) - half.y, abs(p.z) - half.z)
        outside = Vector((max(q[0], 0.0), max(q[1], 0.0), max(q[2], 0.0))).length
        return outside + min(max(q), 0.0) - r

    verts, faces = uv_sphere(1.0, segments, rings)
    surface = []
    for x, y, z in verts:
        direction = Vector((x, y, z))
        low, high = 0.0, reach
        for _ in range(36):
            mid = (low + high) / 2
            if inside(direction * mid) < 0:
                low = mid
            else:
                high = mid
        surface.append(tuple(direction * ((low + high) / 2)))
    return surface, faces


def capsule(length: float, radius: float, segments: int = 64, cap_steps: int = 14):
    """Closed capsule (rod) along +Z: a cylinder capped by two hemispheres.

    ``length`` is tip to tip; it must be at least twice ``radius``.
    """
    radius = min(radius, length / 2)
    straight = max(0.0, length / 2 - radius)
    profile = []
    for step in range(cap_steps + 1):
        angle = math.pi / 2 * step / cap_steps
        profile.append((radius * math.sin(angle), -straight - radius * math.cos(angle)))
    for step in range(1, cap_steps):
        angle = math.pi / 2 * step / cap_steps
        profile.append((radius, -straight + 2 * straight * step / cap_steps))
    for step in range(cap_steps + 1):
        angle = math.pi / 2 * step / cap_steps
        profile.append((radius * math.cos(angle), straight + radius * math.sin(angle)))
    return lathe(profile, segments)


def lathe(profile, segments: int = 64, *, axial=(0, 0, 1)):
    """Surface of revolution from a bottom→top ``[(radius, height), ...]`` profile.

    A radius of 0 at either end becomes a single pole vertex, so the result is a
    closed surface without holes.
    """
    verts, faces = [], []
    rings = []
    for radius, height in profile:
        if radius <= 1e-9:
            rings.append([len(verts)])
            verts.append((0.0, 0.0, height))
        else:
            start = len(verts)
            for i in range(segments):
                t = TAU * i / segments
                verts.append((radius * math.cos(t), radius * math.sin(t), height))
            rings.append(list(range(start, start + segments)))
    for lower, upper in zip(rings, rings[1:]):
        if len(lower) == 1:
            faces.extend((lower[0], upper[i], upper[(i + 1) % segments]) for i in range(segments))
        elif len(upper) == 1:
            faces.extend((lower[i], lower[(i + 1) % segments], upper[0]) for i in range(segments))
        else:
            for i in range(segments):
                j = (i + 1) % segments
                faces.append((lower[i], lower[j], upper[j], upper[i]))
    return verts, faces


def _frames(points):
    """Parallel-transport frames along a polyline (stable, no twisting)."""
    points = [Vector(p) for p in points]
    tangents = []
    for i, p in enumerate(points):
        if i == 0:
            t = points[1] - p
        elif i == len(points) - 1:
            t = p - points[i - 1]
        else:
            t = points[i + 1] - points[i - 1]
        tangents.append(t.normalized())
    up = Vector((0, 0, 1))
    if abs(tangents[0].dot(up)) > 0.95:
        up = Vector((1, 0, 0))
    normal = (up - tangents[0] * up.dot(tangents[0])).normalized()
    frames = []
    for i, tangent in enumerate(tangents):
        if i:
            normal = normal - tangent * normal.dot(tangent)
            if normal.length < 1e-6:
                normal = Vector((1, 0, 0)) - tangent * tangent.x
            normal.normalize()
        binormal = tangent.cross(normal).normalized()
        frames.append((normal.copy(), binormal))
    return points, tangents, frames


def tube(points, radius, sides: int = 14, radii=None, caps: bool = True):
    """Sweep a circle along a polyline; ``radii`` tapers it ring by ring."""
    nodes, _tangents, frames = _frames(points)
    if isinstance(radius, (int, float)):
        radii = [radius] * len(nodes)
    elif radii is None:
        radii = list(radius)
    verts, faces = [], []
    for node, (normal, binormal), r in zip(nodes, frames, radii):
        for i in range(sides):
            t = TAU * i / sides
            offset = normal * (math.cos(t) * r) + binormal * (math.sin(t) * r)
            verts.append(tuple(node + offset))
    for j in range(len(nodes) - 1):
        for i in range(sides):
            k = (i + 1) % sides
            a = j * sides + i
            b = j * sides + k
            faces.append((a, b, b + sides, a + sides))
    if caps:
        first = len(verts)
        verts.append(tuple(nodes[0]))
        last = len(verts)
        verts.append(tuple(nodes[-1]))
        for i in range(sides):
            k = (i + 1) % sides
            faces.append((first, k, i))
            base = (len(nodes) - 1) * sides
            faces.append((last, base + i, base + k))
    return verts, faces


def ribbon(points, width, thickness: float = 0.03, up=(0, 0, 1)):
    """Flat curved sheet with thickness — endoplasmic reticulum and lamellae.

    The sheet keeps ``up`` as its surface normal, so a curve drawn on the floor
    plane yields a horizontal cisterna rather than a twisted band.
    """
    nodes = [Vector(p) for p in points]
    up = Vector(up).normalized()
    tangents = []
    for i, node in enumerate(nodes):
        if i == 0:
            t = nodes[1] - node
        elif i == len(nodes) - 1:
            t = node - nodes[i - 1]
        else:
            t = nodes[i + 1] - nodes[i - 1]
        tangents.append(t.normalized())
    profile = [(-width / 2, -thickness / 2), (width / 2, -thickness / 2), (width / 2, thickness / 2), (-width / 2, thickness / 2)]
    sides = len(profile)
    verts, faces = [], []
    for node, tangent in zip(nodes, tangents):
        side = tangent.cross(up)
        if side.length < 1e-6:
            side = Vector((1, 0, 0))
        side.normalize()
        normal = side.cross(tangent).normalized()
        for (u, v) in profile:
            verts.append(tuple(node + side * u + normal * v))
    for j in range(len(nodes) - 1):
        for i in range(sides):
            k = (i + 1) % sides
            a, b = j * sides + i, j * sides + k
            faces.append((a, b, b + sides, a + sides))
    faces.append((0, 1, 2, 3))
    base = (len(nodes) - 1) * sides
    faces.append((base + 3, base + 2, base + 1, base + 0))
    return verts, faces


def disc(radius: float, thickness: float, segments: int = 40, bulge: float = 0.0):
    """Flattened lens used for Golgi cisternae, grana and cristae."""
    profile = [
        (0.0, -thickness / 2 - bulge * 0.0),
        (radius * 0.55, -thickness / 2 - bulge * 0.15),
        (radius * 0.9, -thickness / 2 + bulge * 0.2),
        (radius, 0.0),
        (radius * 0.9, thickness / 2 - bulge * 0.2),
        (radius * 0.55, thickness / 2 + bulge * 0.15),
        (0.0, thickness / 2),
    ]
    return lathe(profile, segments)


def ring_tube(major: float, minor: float, major_segments: int = 48, minor_segments: int = 12):
    verts, faces = [], []
    for i in range(major_segments):
        u = TAU * i / major_segments
        centre = Vector((major * math.cos(u), major * math.sin(u), 0))
        outward = Vector((math.cos(u), math.sin(u), 0))
        for j in range(minor_segments):
            v = TAU * j / minor_segments
            offset = outward * (minor * math.cos(v)) + Vector((0, 0, minor * math.sin(v)))
            verts.append(tuple(centre + offset))
    for i in range(major_segments):
        ni = (i + 1) % major_segments
        for j in range(minor_segments):
            nj = (j + 1) % minor_segments
            faces.append((i * minor_segments + j, ni * minor_segments + j, ni * minor_segments + nj, i * minor_segments + nj))
    return verts, faces


# --------------------------------------------------------------------------
# mesh surgery
# --------------------------------------------------------------------------


def cut_plane(obj, point, normal, *, keep="below", cap: bool = False):
    """Remove the half of a mesh on one side of a plane (teaching cutaway).

    ``keep='below'`` keeps the material the normal points **away** from, so the
    cutaway opening faces the normal — pass the direction of the viewer to open
    the model towards the camera.

    The plane is in the object's **local** space: an object placed with
    ``matrix=`` must be cut with local coordinates, otherwise the plane sits
    somewhere else entirely and can silently delete the whole mesh.
    """
    point, normal = Vector(point), Vector(normal).normalized()
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(
        bm,
        geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        plane_co=point,
        plane_no=normal,
        clear_inner=keep == "above",
        clear_outer=keep == "below",
    )
    if cap:
        edges = [e for e in bm.edges if e.is_boundary]
        if edges:
            bmesh.ops.holes_fill(bm, edges=edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def solidify(obj, thickness: float, offset: float = -1.0):
    """Give an open surface real thickness (membranes, walls, cut shells)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=thickness)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def hollow(obj, thickness: float, offset: float = -1.0):
    inv = Matrix.Diagonal(Vector((-1, -1, -1, 1)))
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=thickness)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def merge(name, objects, *, organelle=None, materials=None):
    """Merge objects into one mesh, keeping material slots in a stable order."""
    objects = [obj for obj in objects if obj is not None]
    if not objects:
        raise ValueError(f"merge({name!r}) received no objects — this structure would be missing from the export")
    palette = list(materials or [])
    for obj in objects:
        for mat in obj.data.materials:
            if mat not in palette:
                palette.append(mat)
    verts, faces, material_index = [], [], []
    for obj in objects:
        matrix = obj.matrix_world
        base = len(verts)
        slot_map = [palette.index(mat) for mat in obj.data.materials] or [0]
        for vertex in obj.data.vertices:
            verts.append(tuple(matrix @ vertex.co))
        for poly in obj.data.polygons:
            faces.append(tuple(base + i for i in poly.vertices))
            material_index.append(slot_map[min(poly.material_index, len(slot_map) - 1)])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=False)
    for mat in palette:
        mesh.materials.append(mat)
    for poly, index in zip(mesh.polygons, material_index):
        poly.material_index = index
        poly.use_smooth = True
    layer = mesh.uv_layers.new(name="UVMap")
    flat = _box_uvs(verts, faces)
    if len(flat) == len(layer.data):
        for loop, co in zip(layer.data, flat):
            loop.uv = co
    _recalc_normals(mesh)
    mesh.update()
    merged = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(merged)
    if organelle:
        merged["organelle"] = organelle
    for obj in objects:
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data.users == 0:
            bpy.data.meshes.remove(data)
    return merged


def build(name, verts, faces, mat, *, organelle=None, matrix: Matrix | None = None, **kwargs):
    """Convenience: create one object and optionally place it."""
    obj = new_object(name, verts, faces, mat, organelle=organelle or name, **kwargs)
    if matrix is not None:
        obj.matrix_world = matrix
    return obj


# --------------------------------------------------------------------------
# occupancy — keeping structures out of each other
# --------------------------------------------------------------------------


def point_inside(obj, point, margin: float = 0.0) -> bool:
    """True when a world-space point lies inside ``obj``.

    Works from the closest surface point and its outward normal, so it handles
    the open shells these models are built from as well as closed volumes.
    """
    hit, location, normal, _index = obj.closest_point_on_mesh(
        obj.matrix_world.inverted() @ Vector(point)
    )
    if not hit:
        return False
    world_location = obj.matrix_world @ location
    world_normal = (obj.matrix_world.to_3x3() @ normal).normalized()
    return (Vector(point) - world_location).dot(world_normal) < -margin


def _deepest_penetration(obj, obstacles, samples: int):
    """Worst (depth, outward direction) of ``obj``'s vertices inside obstacles."""
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    stride = max(1, len(points) // max(1, samples))
    deepest = 0.0
    direction = Vector((0.0, 0.0, 0.0))
    for obstacle in obstacles:
        inverse = obstacle.matrix_world.inverted()
        for point in points[::stride]:
            hit, location, normal, _index = obstacle.closest_point_on_mesh(inverse @ point)
            if not hit:
                continue
            world_location = obstacle.matrix_world @ location
            world_normal = (obstacle.matrix_world.to_3x3() @ normal).normalized()
            depth = (world_location - point).dot(world_normal)
            if depth > deepest:
                deepest = depth
                direction = world_normal
    return deepest, direction


def push_out(obj, obstacles, *, margin: float = 0.12, samples: int = 200,
             iterations: int = 18) -> int:
    """Nudge ``obj`` until none of its sampled vertices sit inside an obstacle.

    Hand-placed organelles read well but were never checked against their
    neighbours; this resolves the collisions that result without throwing the
    composition away. Returns the number of moves made.
    """
    moves = 0
    for _ in range(iterations):
        depth, direction = _deepest_penetration(obj, [o for o in obstacles if o is not obj], samples)
        if depth <= margin or direction.length < 1e-6:
            break
        obj.location = obj.location + direction * (depth - margin + 0.01)
        moves += 1
    return moves


def clamp_inside_box(obj, half, *, margin: float = 0.08) -> tuple[float, float, float]:
    """Slide ``obj`` until its bounding box fits inside ``±half``.

    Exact and cheap, unlike nudging against a thin shell: the plant cell's
    envelope is only 0.045 thick, so a chloroplast easily straddles it with every
    vertex outside and an inside/outside test never fires.
    """
    matrix = obj.matrix_world
    points = [matrix @ vertex.co for vertex in obj.data.vertices]
    if not points:
        return (0.0, 0.0, 0.0)
    low = [min(point[axis] for point in points) for axis in range(3)]
    high = [max(point[axis] for point in points) for axis in range(3)]
    shift = [0.0, 0.0, 0.0]
    for axis in range(3):
        limit = half[axis] - margin
        if high[axis] > limit:
            shift[axis] -= high[axis] - limit
        elif low[axis] < -limit:
            shift[axis] += -limit - low[axis]
    obj.location = obj.location + Vector(shift)
    return tuple(shift)


def clamp_points_to_box(points, half, *, margin: float = 0.08):
    """Clamp a polyline into an axis-aligned box, node by node."""
    clamped = []
    for point in points:
        clamped.append(tuple(
            max(-(half[axis] - margin), min(half[axis] - margin, point[axis]))
            for axis in range(3)
        ))
    return clamped


def clamp_mesh_to_box(obj, half, *, margin: float = 0.08):
    """Pull every vertex of an object inside an axis-aligned box.

    Used for the ER network in a box-shaped cell: the sheets wrap a nucleus that
    already sits near the membrane, so clamping the finished geometry is more
    predictable than steering each control point.
    """
    for vertex in obj.data.vertices:
        vertex.co = Vector(tuple(
            max(-(half[axis] - margin), min(half[axis] - margin, vertex.co[axis]))
            for axis in range(3)
        ))
    obj.data.update()
    return obj


def rounded_box_sdf(point, size=(1, 1, 1), radius: float = 0.4):
    """Signed distance to a rounded box: negative inside, positive outside."""
    half = Vector((size[0] / 2, size[1] / 2, size[2] / 2))
    r = max(1e-3, min(radius, min(half) * 0.95))
    inner = half - Vector((r, r, r))
    q = Vector((abs(point[0]) - inner.x, abs(point[1]) - inner.y, abs(point[2]) - inner.z))
    outside = Vector((max(q.x, 0.0), max(q.y, 0.0), max(q.z, 0.0))).length
    return outside + min(max(q.x, q.y, q.z), 0.0) - r


def clamp_inside_rounded_box(obj, size=(1, 1, 1), radius: float = 0.4, *, margin: float = 0.1,
                             iterations: int = 12) -> int:
    """Slide ``obj`` until every vertex is inside a rounded box.

    The plant cell is a rounded box, so an axis-aligned clamp lets a chloroplast
    poke out through a rounded corner. This walks the whole object back along the
    direction of its worst violation without deforming it.
    """
    moves = 0
    for _ in range(iterations):
        worst = 0.0
        worst_point = None
        matrix = obj.matrix_world
        for vertex in obj.data.vertices:
            point = matrix @ vertex.co
            distance = rounded_box_sdf(point, size, radius)
            if distance > worst:
                worst = distance
                worst_point = point
        if worst_point is None or worst <= -margin:
            break
        direction = Vector((-worst_point.x, -worst_point.y, -worst_point.z))
        if direction.length < 1e-6:
            direction = Vector((0.0, 0.0, 1.0))
        obj.location = obj.location + direction.normalized() * (worst + margin)
        moves += 1
    return moves


def contain(obj, boundary, *, margin: float = 0.06, samples: int = 200,
            iterations: int = 10) -> int:
    """Pull ``obj`` back inside a boundary shell it is poking through.

    The counterpart of :func:`push_out`: avoidance moves a structure out of its
    neighbours, which can shove it straight through the plasma membrane, so the
    envelope is applied afterwards as a containment constraint.
    """
    moves = 0
    for _ in range(iterations):
        depth, direction = _deepest_penetration(obj, [boundary], samples)
        if depth <= margin or direction.length < 1e-6:
            break
        # step against the outward normal, i.e. back into the cell
        obj.location = obj.location - direction * (depth - margin + 0.01)
        moves += 1
    return moves


def deconflict(objects, obstacles, *, margin: float = 0.12) -> int:
    """Run :func:`push_out` over a list of objects; returns the total moves."""
    return sum(push_out(obj, obstacles, margin=margin) for obj in objects)


def place_free(unit, matrix, obstacles, *, margin: float = 0.1, attempts: int = 60,
               samples: int = 200, step: float = 0.2, max_offset: float | None = None):
    """Place a copy of ``unit`` near ``matrix`` without intersecting anything.

    The first move escapes along the penetration direction — a single push
    cannot separate two objects that straddle each other — and the remaining
    attempts fan out on a deterministic golden-angle spiral.

    ``max_offset`` caps how far the search may wander. Without it a call whose
    nominal position is already sound can end up flung across the cell, which
    breaks layouts that were computed to fit (the plant cell's peripheral ring).
    """
    copy = copy_object(unit, matrix)
    if not obstacles:
        return copy

    gold = 2.399963  # golden angle, so successive offsets fan out evenly
    limit = max_offset if max_offset is not None else step * math.sqrt(attempts)
    for attempt in range(attempts):
        depth, direction = _deepest_penetration(copy, obstacles, samples)
        if depth <= margin:
            return copy
        if attempt == 0 and direction.length > 1e-6:
            offset = direction * min(depth + step, limit)
        else:
            radius = min(step * math.sqrt(attempt + 1), limit)
            angle = gold * attempt
            offset = Vector((
                radius * math.cos(angle),
                radius * math.sin(angle) * 0.7,
                radius * math.sin(angle * 0.5) * 0.5,
            ))
        copy.matrix_world = Matrix.Translation(offset) @ matrix
    return copy


def free_point(occupancy, point, *, margin: float = 0.08) -> bool:
    """True when a point is outside every object in ``occupancy``."""
    return not any(point_inside(obj, point, margin) for obj in occupancy)


# Bounding spheres are the blunt instrument for path avoidance. An exact
# inside/outside test is ambiguous for the cut-open shells these models are made
# of — a point in a mitochondrion's cavity reports as "inside" whichever wall is
# nearest, and pushing it to that wall leaves it in the cavity. A sphere is
# conservative, unambiguous and fast, and clearing it guarantees clearance.


def bounding_sphere(obj):
    """World-space bounding sphere of an object's vertices."""
    matrix = obj.matrix_world
    points = [matrix @ vertex.co for vertex in obj.data.vertices]
    if not points:
        return Vector((0.0, 0.0, 0.0)), 0.0
    low = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    high = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    centre = (low + high) / 2
    return centre, max((point - centre).length for point in points)


def obstacle_spheres(objects):
    """Bounding spheres of every separate island in ``objects``.

    A merged structure spans the whole cell — the seven mitochondria share one
    mesh, so their combined sphere would block almost the entire cytoplasm.
    Splitting the mesh into connected components gives one sphere per placed
    copy, which is the granularity the path avoidance needs.
    """
    spheres = []
    for obj in objects:
        spheres.extend(component_spheres(obj))
    return spheres


def component_spheres(obj):
    """Bounding sphere per connected island of one mesh."""
    mesh = obj.data
    count = len(mesh.vertices)
    if not count:
        return []
    parent = list(range(count))

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(first, second):
        root_a, root_b = find(first), find(second)
        if root_a != root_b:
            parent[root_b] = root_a

    for polygon in mesh.polygons:
        vertices = polygon.vertices
        for other in vertices[1:]:
            union(vertices[0], other)

    matrix = obj.matrix_world
    groups = {}
    for index, vertex in enumerate(mesh.vertices):
        groups.setdefault(find(index), []).append(matrix @ vertex.co)

    spheres = []
    for points in groups.values():
        low = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
        high = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
        centre = (low + high) / 2
        spheres.append((centre, max((point - centre).length for point in points)))
    return spheres


def in_sphere(point, sphere, margin: float = 0.0) -> bool:
    centre, radius = sphere
    return (Vector(point) - centre).length < radius + margin


def free_of_spheres(point, spheres, margin: float = 0.0) -> bool:
    return not any(in_sphere(point, sphere, margin) for sphere in spheres)


def retreat_from_spheres(point, spheres, *, margin: float = 0.08):
    """Push a point out of every sphere it sits inside."""
    point = Vector(point)
    for centre, radius in spheres:
        direction = point - centre
        limit = radius + margin
        if direction.length < limit:
            if direction.length < 1e-6:
                direction = Vector((0.0, 0.0, 1.0))
            point = centre + direction.normalized() * limit
    return point


def retreat_polyline_spheres(points, spheres, *, margin: float = 0.08):
    return [tuple(retreat_from_spheres(point, spheres, margin=margin)) for point in points]


def retreat_point(point, obstacles, *, margin: float = 0.06):
    """Move a point out of every obstacle it sits inside.

    Used for polylines — cytoskeleton filaments and ER tubules — that are drawn
    through a crowded cytoplasm: rather than rejecting a whole strand, each node
    that lands inside an organelle is pushed back to its surface.
    """
    point = Vector(point)
    for obstacle in obstacles:
        hit, location, normal, _index = obstacle.closest_point_on_mesh(
            obstacle.matrix_world.inverted() @ point
        )
        if not hit:
            continue
        world_location = obstacle.matrix_world @ location
        world_normal = (obstacle.matrix_world.to_3x3() @ normal).normalized()
        if (world_location - point).dot(world_normal) > 0:
            point = world_location + world_normal * margin
    return point


def retreat_polyline(points, obstacles, *, margin: float = 0.06):
    return [tuple(retreat_point(point, obstacles, margin=margin)) for point in points]


def densify(points, factor: int = 4):
    """Insert evenly spaced points between every pair.

    Retreating nodes alone is not enough: a long segment can pass straight
    through a mitochondrion with both of its endpoints outside it, so the path
    is subdivided until the segments are shorter than the organelles they dodge.
    """
    if factor <= 1 or len(points) < 2:
        return [tuple(point) for point in points]
    dense = []
    for first, second in zip(points, points[1:]):
        start, end = Vector(first), Vector(second)
        for step in range(factor):
            dense.append(tuple(start.lerp(end, step / factor)))
    dense.append(tuple(points[-1]))
    return dense


# --------------------------------------------------------------------------
# export
# --------------------------------------------------------------------------


def export_glb(relative_path: str, **overrides) -> Path:
    path = ROOT / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    available = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    kwargs = {
        "filepath": str(path),
        "export_format": "GLB",
        "export_extras": True,
        "export_apply": True,
        "export_yup": True,
        "use_selection": False,
        "export_cameras": False,
        "export_lights": False,
        "export_materials": "EXPORT",
        "export_normals": True,
        "export_texcoords": True,
        "export_animations": False,
    }
    kwargs.update(overrides)
    bpy.ops.export_scene.gltf(**{k: v for k, v in kwargs.items() if k in available})
    return path


def save_blend(filename: str) -> Path:
    path = ROOT / filename
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    return path


def report(kind: str, **details) -> None:
    payload = " ".join(f"{k}={v}" for k, v in details.items())
    print(f"[cellkit] {kind} {payload}".rstrip())
