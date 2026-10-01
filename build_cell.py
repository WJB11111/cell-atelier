"""Reusable organelle builders shared by the specimen build scripts.

``build_animal_detailed.py`` and ``build_plant_detailed.py`` both import this
module, so the two specimens keep the same material palette, the same cutaway
convention and the same naming of ``organelle`` groups that the viewer expects.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Euler, Matrix, Vector  # noqa: E402

import cellkit as ck  # noqa: E402

TAU = math.tau

# --------------------------------------------------------------------------
# palette — the viewer shows the same hex value in its structure list
# --------------------------------------------------------------------------

COLORS = {
    "nucleus": "#85519f",
    "nucleolus": "#633d78",
    "chromatin": "#9d6cb4",
    "mitochondria": "#c96a4e",
    "cristae": "#e09a83",
    "er": "#8b69a6",
    "er_smooth": "#c87e96",
    "golgi": "#c87e96",
    "membrane": "#a996c6",
    "fibers": "#7fa3b0",
    "centrioles": "#c39b45",
    "vesicles": "#d4b15d",
    "ribosomes": "#9a7cae",
    "chloroplast": "#608443",
    "grana": "#8fae5c",
    "lamellae": "#a8c47a",
    "vacuole": "#64a8b0",
    "wall": "#7c934d",
    "plant_membrane": "#a6c4a0",
    # cyanobacterium envelope
    "envelope": "#5d8f89",
    "plasma": "#a6c4a0",
    "cytoplasm": "#9dc3bb",
    "thylakoids": "#378b82",
    "nucleoid": "#c39855",
    "phycobilisome": "#7fc0b6",
    # leucocyte and neuron
    "granules": "#b3619c",
    "soma": "#a897bf",
    "dendrites": "#9b79ad",
    "axon": "#bc809f",
    "myelin": "#7fa9ad",
    "terminals": "#a777b1",
}

ROUGHNESS = {
    "membrane": 0.30,
    "wall": 0.55,
    "vacuole": 0.22,
    "nucleolus": 0.35,
    "ribosomes": 0.5,
}

_cache: dict[str, object] = {}


def mat(key: str):
    """Cached Principled material for a palette key."""
    if key not in _cache:
        _cache[key] = ck.material(
            f"mat_{key}",
            COLORS[key],
            roughness=ROUGHNESS.get(key, 0.42),
        )
    return _cache[key]


def clear_material_cache() -> None:
    _cache.clear()


def as_shell(obj):
    """Mark a closed envelope so the viewer can cross-fade it with the section."""
    obj["wholeShell"] = True
    return obj


# --------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------


def fluted_tube(radius: float, height: float, *, inner: float = 0.0, lobes: int = 9,
                depth: float = 0.07, segments: int = 72, rings: int = 3):
    """Cylinder (or hollow cylinder) with sinusoidal flutes — centrioles, stalks."""
    verts, faces = [], []
    heights = [-height / 2 + height * i / (rings - 1) for i in range(rings)]
    outer_rings, inner_rings = [], []
    for z in heights:
        start = len(verts)
        for i in range(segments):
            t = TAU * i / segments
            r = radius * (1.0 + depth * math.cos(lobes * t))
            verts.append((r * math.cos(t), r * math.sin(t), z))
        outer_rings.append(list(range(start, start + segments)))
    for lower, upper in zip(outer_rings, outer_rings[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((lower[i], lower[j], upper[j], upper[i]))
    if inner > 0:
        for z in heights:
            start = len(verts)
            for i in range(segments):
                t = TAU * i / segments
                r = inner * (1.0 + depth * 0.4 * math.cos(lobes * t))
                verts.append((r * math.cos(t), r * math.sin(t), z))
            inner_rings.append(list(range(start, start + segments)))
        for lower, upper in zip(inner_rings, inner_rings[1:]):
            for i in range(segments):
                j = (i + 1) % segments
                faces.append((lower[j], lower[i], upper[i], upper[j]))
        # annular caps at both ends
        for outer, inn in ((outer_rings[0], inner_rings[0]), (outer_rings[-1], inner_rings[-1])):
            for i in range(segments):
                j = (i + 1) % segments
                faces.append((outer[i], outer[j], inn[j], inn[i]))
    else:
        for ring, reverse in ((outer_rings[0], True), (outer_rings[-1], False)):
            centre = len(verts)
            verts.append((0.0, 0.0, heights[0] if reverse else heights[-1]))
            for i in range(segments):
                j = (i + 1) % segments
                faces.append((centre, ring[j], ring[i]) if reverse else (centre, ring[i], ring[j]))
    return verts, faces


# --------------------------------------------------------------------------
# organelles
# --------------------------------------------------------------------------


def mitochondrion(rng: ck.Rng, *, length: float = 1.05, radius: float = 0.32, open: bool = True):
    """One cut-open mitochondrion: outer envelope plus inner cristae."""
    objects = []
    envelope_verts, envelope_faces = ck.uv_sphere(1.0, 40, 22)
    envelope = ck.new_object(
        "mito_shell",
        [(v[0] * length, v[1] * radius, v[2] * radius) for v in envelope_verts],
        envelope_faces,
        mat("mitochondria"),
    )
    if open:
        # a shallow opening towards the viewer keeps the shape readable
        normal = Vector((0.0, -1.0, 0.30)).normalized()
        ck.cut_plane(envelope, tuple(normal * radius * 0.42), (0, -1, 0.30), keep="below")
        ck.solidify(envelope, 0.035)
    objects.append(envelope)

    cristae = []
    count = 5
    for i in range(count):
        x = -length * 0.62 + length * 1.24 * (i + 0.5) / count
        shelf = radius * rng.uniform(0.72, 0.92)
        tilt = rng.uniform(-0.22, 0.22)
        # textbook cristae: folds that cross the matrix, perpendicular to the long axis
        verts, faces = ck.disc(shelf, 0.024, 32, 0.05)
        cristae.append(
            ck.new_object(
                f"crista_{i}",
                verts,
                faces,
                mat("cristae"),
                matrix=ck.transform((x, rng.uniform(-0.03, 0.03), rng.uniform(-0.04, 0.04)),
                                    (0.0, math.pi / 2 + tilt, rng.uniform(-0.25, 0.25))),
            )
        )
    objects.extend(cristae)
    return objects


def mitochondria(placements, rng: ck.Rng, *, organelle: str = "mitochondria",
                 obstacles=(), margin: float = 0.02, max_offset: float | None = None):
    """Build one mitochondrion and place rotated, rescaled copies of it.

    ``obstacles`` are already-placed structures that each copy is placed around,
    so a mitochondrion never ends up buried in the nucleus or the Golgi.
    ``max_offset`` keeps that search local when the layout was computed to fit.
    """
    unit = ck.merge("mitochondrion", mitochondrion(rng))
    parts = []
    for i, (location, rotation, scale) in enumerate(placements):
        copy = ck.place_free(unit, ck.transform(location, rotation, scale), obstacles,
                             margin=margin, samples=200, max_offset=max_offset)
        copy.name = f"{organelle}_{i}"
        parts.append(copy)
    merged = ck.merge(organelle, parts, organelle=organelle)
    # the template is only a source for the copies: merging it in would leave a
    # mitochondrion sitting at the model's origin
    ck.discard(unit)
    return merged


def golgi_stack(rng: ck.Rng, *, span: float = 0.58, layers: int = 5, organelle: str = "golgi"):
    """Stacked, slightly curved cisternae with a few budding vesicles."""
    parts = []
    for i in range(layers):
        radius = span * (0.58 + 0.42 * math.sin(math.pi * (i + 0.6) / (layers + 0.2)))
        thickness = 0.048 + 0.012 * (i / max(1, layers - 1))
        verts, faces = ck.disc(radius, thickness, 44, 0.04)
        # cisternae curve like a shallow bowl around the stack axis
        verts = [(x, y, z + 0.16 * (x * x + y * y) / max(radius, 1e-3) ** 2) for (x, y, z) in verts]
        parts.append(
            ck.new_object(
                f"cisterna_{i}",
                verts,
                faces,
                mat("golgi"),
                matrix=ck.transform((0, 0, (i - (layers - 1) / 2) * 0.115)),
            )
        )
    for i in range(7):
        radius = rng.uniform(0.05, 0.1)
        verts, faces = ck.uv_sphere(radius, 16, 10)
        parts.append(
            ck.new_object(
                f"golgi_vesicle_{i}",
                verts,
                faces,
                mat("vesicles"),
                matrix=ck.transform(
                    (
                        rng.uniform(-span, span) * 1.3,
                        rng.uniform(-span, span) * 1.3,
                        rng.uniform(-0.26, 0.26),
                    ),
                    (rng.uniform(0, TAU), rng.uniform(0, TAU), 0),
                ),
            )
        )
    return ck.merge(organelle, parts, organelle=organelle)


def nucleus(centre, radius: float, rng: ck.Rng, *, cut_normal=(0, -1, 0.85),
            nucleolus_scale: float = 0.27, pores: bool = True):
    """Cut-open nuclear envelope plus its nucleolus.

    Returns ``(nucleus, nucleolus)`` as two separate objects: the viewer keeps
    the nucleolus selectable through the nucleus entry.
    """
    verts, faces = ck.uv_sphere(1.0, 64, 32)
    # a slightly irregular envelope reads better than a perfect sphere
    shell = ck.new_object(
        "nucleus_shell",
        [(v[0] * radius * 1.0, v[1] * radius * 0.97, v[2] * radius * 0.99) for v in verts],
        faces,
        mat("nucleus"),
        matrix=ck.transform(centre),
    )
    ck.displace(shell, radius * 0.03, 1.5, seed=3)
    normal = Vector(cut_normal).normalized()
    ck.cut_plane(shell, tuple(normal * radius * 0.34), cut_normal, keep="below")
    ck.solidify(shell, radius * 0.055)
    parts = [shell]

    if pores:
        for i in range(12):
            theta = rng.uniform(0, TAU)
            phi = rng.uniform(0.35, math.pi - 0.35)
            direction = Vector(
                (math.sin(phi) * math.cos(theta), math.sin(phi) * math.sin(theta), math.cos(phi))
            )
            if direction.dot(Vector(cut_normal).normalized()) > 0.2:
                continue
            verts, faces = ck.ring_tube(radius * 0.075, radius * 0.022, 20, 8)
            pore = ck.new_object(f"pore_{i}", verts, faces, mat("chromatin"))
            position = Vector(centre) + direction * radius * 0.99
            basis = direction.normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
            pore.matrix_world = Matrix.Translation(position) @ basis
            parts.append(pore)

    nucleolus = ck.new_object(
        "nucleolus",
        *ck.uv_sphere(radius * nucleolus_scale, 28, 16),
        mat("nucleolus"),
        # kept just inside the cut plane so it never pokes through the opening
        matrix=ck.transform(Vector(centre) + normal * (radius * 0.02) + Vector((radius * 0.14, 0, -radius * 0.06))),
        organelle="nucleolus",
    )
    return ck.merge("nucleus", parts, organelle="nucleus"), nucleolus


def clamp_to_cell(points, limit: float):
    """Pull polyline points inside a sphere around the origin.

    The ER tubules drift outward along every axis, so clamping the radius from
    the nucleus is not enough — the whole point has to stay inside the cell.
    """
    clamped = []
    for point in points:
        vector = Vector(point)
        if vector.length > limit:
            vector = vector.normalized() * limit
        clamped.append(tuple(vector))
    return clamped


def er_network(centre, radius: float, rng: ck.Rng, *, sheets: int = 5, tubes: int = 5,
               ribosome_dots: int = 60, sheet_width: float = 0.62, spread: float = 1.42,
               max_reach: float | None = None, avoid_spheres=()):
    """Rough ER cisternae hugging the nucleus plus a smooth ER tubule cluster.

    ``max_reach`` clamps how far any point may sit from the **origin**. Without
    it the cluster spirals past the plasma membrane and, in the whole-view
    modes, pokes out of the cell. ``avoid_spheres`` are the bounding spheres of
    already-placed structures: every sheet and tubule node is pushed clear of
    them, so the network wraps around mitochondria instead of through them.
    """
    centre = Vector(centre)
    rough, smooth, dots = [], [], []
    for i in range(sheets):
        angle = -1.15 + i * (2.5 / max(1, sheets - 1))
        tilt = rng.uniform(-0.1, 0.1)
        lift = (i - (sheets - 1) / 2) * 0.3
        points = []
        for k in range(11):
            a = angle + (k - 5) * 0.17
            r = radius * (spread + 0.18 * math.sin(k * 0.7) + tilt)
            points.append(
                (
                    centre.x + r * math.cos(a),
                    centre.y + r * math.sin(a) * 0.95,
                    centre.z + lift + 0.16 * math.sin(a) + (k - 5) * 0.03,
                )
            )
        if max_reach is not None:
            points = clamp_to_cell(points, max_reach)
        if avoid_spheres:
            points = ck.retreat_polyline_spheres(ck.densify(points, 5), avoid_spheres, margin=0.1)
            if max_reach is not None:
                points = clamp_to_cell(points, max_reach)
        verts, faces = ck.ribbon(points, sheet_width, 0.032, up=(0, 0, 1))
        sheet = ck.new_object(f"rough_er_{i}", verts, faces, mat("er"))
        rough.append(sheet)
        for d in range(ribosome_dots // sheets):
            t = rng.uniform(0.06, 0.94)
            index = min(len(points) - 2, int(t * (len(points) - 1)))
            local = t * (len(points) - 1) - index
            base = Vector(points[index]).lerp(Vector(points[index + 1]), local)
            offset = Vector((rng.uniform(-0.32, 0.32), rng.uniform(-0.32, 0.32), rng.uniform(0.035, 0.07)))
            dot_at = base + offset
            if avoid_spheres and not ck.free_of_spheres(dot_at, avoid_spheres, margin=0.03):
                continue
            dots.append(
                ck.new_object(
                    f"er_ribosome_{i}_{d}",
                    *ck.uv_sphere(rng.uniform(0.032, 0.046), 10, 7),
                    mat("ribosomes"),
                    matrix=ck.transform(dot_at),
                )
            )
    for i in range(tubes):
        start_angle = rng.uniform(-0.9, 0.5)
        points = []
        steps = 12
        for k in range(steps):
            a = start_angle + k * 0.19 * rng.uniform(0.85, 1.15)
            r = radius * (1.3 + k * 0.28)
            if max_reach is not None:
                r = min(r, max_reach * (0.55 + 0.45 * k / (steps - 1)))
            points.append(
                (
                    centre.x + r * math.cos(a),
                    centre.y + r * math.sin(a) * rng.uniform(0.9, 1.1),
                    centre.z + 1.1 * math.sin(k * 0.5) - 0.09 * k,
                )
            )
        if max_reach is not None:
            points = clamp_to_cell(points, max_reach)
        if avoid_spheres:
            points = ck.retreat_polyline_spheres(ck.densify(points, 5), avoid_spheres, margin=0.16)
            if max_reach is not None:
                points = clamp_to_cell(points, max_reach)
        radii = [0.062 * (1 - 0.35 * k / max(1, len(points) - 1)) for k in range(len(points))]
        verts, faces = ck.tube(points, radii, 12)
        smooth.append(ck.new_object(f"smooth_er_{i}", verts, faces, mat("er_smooth")))
    return rough, smooth, dots


def cloud(rng: ck.Rng, count: int, radius, *, radius_range=(0.03, 0.05), centre=(0, 0, 0),
          exclude=(), avoid=(), avoid_spheres=(), organelle: str = "ribosomes",
          name: str | None = None, scale=None, materials=None):
    """Deterministic scatter of small bodies inside a ball, avoiding organelles.

    ``exclude`` is a list of ``(centre, radius)`` spheres for cheap rejection;
    ``avoid`` is a list of Blender objects; ``avoid_spheres`` is the same list
    already reduced to bounding spheres, which is what callers normally pass.
    """
    centre = Vector(centre)
    stretch = Vector(scale) if scale else Vector((1, 1, 1))
    parts = []
    placed = 0
    attempts = 0
    while placed < count and attempts < count * 60:
        attempts += 1
        offset = rng.point_in_ball(radius)
        point = centre + Vector((offset.x * stretch.x, offset.y * stretch.y, offset.z * stretch.z))
        if any((point - Vector(c)).length < r + 0.08 for c, r in exclude):
            continue
        if avoid_spheres and not ck.free_of_spheres(point, avoid_spheres, margin=0.04):
            continue
        if avoid and not ck.free_point(avoid, point):
            continue
        size = rng.uniform(*radius_range)
        parts.append(
            ck.new_object(
                f"{organelle}_{placed}",
                *ck.uv_sphere(size, 10, 7),
                mat(organelle),
                matrix=ck.transform(point, rng.rotation()),
            )
        )
        placed += 1
    if placed == 0:
        raise ValueError(
            f"cloud({organelle}): no free position found — the occupancy constraints leave no room"
        )
    return ck.merge(name or organelle, parts, organelle=organelle)


def chloroplast(rng: ck.Rng, *, length: float = 1.5, radius: float = 0.72, grana: int = 6):
    """Cut-open chloroplast: envelope, grana stacks and connecting lamellae."""
    parts = []
    verts, faces = ck.uv_sphere(1.0, 48, 26)
    envelope = ck.new_object(
        "chloroplast_envelope",
        [(v[0] * length, v[1] * radius, v[2] * radius * 0.8) for v in verts],
        faces,
        mat("chloroplast"),
    )
    ck.cut_plane(envelope, (0, 0, 0), (0, -1, 0.35), keep="below")
    ck.solidify(envelope, 0.045)
    parts.append(envelope)

    inner_verts, inner_faces = ck.uv_sphere(1.0, 40, 22)
    inner = ck.new_object(
        "chloroplast_stroma",
        [(v[0] * length * 0.94, v[1] * radius * 0.94, v[2] * radius * 0.74) for v in inner_verts],
        inner_faces,
        mat("lamellae"),
    )
    ck.cut_plane(inner, (0, 0, 0), (0, -1, 0.35), keep="below")
    ck.solidify(inner, 0.012)
    parts.append(inner)

    for g in range(grana):
        x = -length * 0.6 + length * 1.2 * (g + 0.5) / grana
        y = rng.uniform(-radius * 0.42, radius * 0.42)
        count = rng.uniform(3.5, 5.5)
        for k in range(int(round(count))):
            verts, faces = ck.disc(radius * rng.uniform(0.17, 0.24), 0.035, 24, 0.03)
            parts.append(
                ck.new_object(
                    f"granum_{g}_{k}",
                    verts,
                    faces,
                    mat("grana"),
                    matrix=ck.transform((x + rng.uniform(-0.04, 0.04), y, -radius * 0.28 + k * 0.085)),
                )
            )
        verts, faces = ck.ribbon(
            [(x - 0.4, y * 0.8, -radius * 0.05), (x, y, radius * 0.12), (x + 0.45, y * 0.6, -radius * 0.02)],
            0.22,
            0.02,
        )
        parts.append(ck.new_object(f"lamella_{g}", verts, faces, mat("lamellae")))
    return ck.merge("chloroplast", parts, organelle="chloroplast")


def chloroplasts(placements, rng: ck.Rng, *, organelle: str = "chloroplast",
                 obstacles=(), margin: float = 0.14, max_offset: float | None = None):
    """Build one chloroplast and place scaled/rotated copies of it."""
    unit = chloroplast(rng)
    parts = []
    for i, (location, rotation, scale) in enumerate(placements):
        copy = ck.place_free(unit, ck.transform(location, rotation, scale), obstacles,
                             margin=margin, max_offset=max_offset)
        copy.name = f"{organelle}_{i}"
        parts.append(copy)
    merged = ck.merge(organelle, parts, organelle=organelle)
    # see mitochondria(): the template must not stay behind at the origin
    ck.discard(unit)
    return merged


# --------------------------------------------------------------------------
# plant cell envelope — shared by build_plant_detailed.py and build_plant_shells.py
# --------------------------------------------------------------------------

#: The envelope is drawn 15% larger than the first attempt. A real mesophyll cell
#: is 30-100 µm long and its vacuole fills most of that, which leaves only a thin
#: cytoplasmic ring for everything else — reproducing that literally squeezed the
#: chloroplasts into each other and into the tonoplast. Scaling the whole
#: envelope keeps the *proportions* (so the vacuole still dominates the section)
#: while giving the ring room for organelles drawn at a readable size.
PLANT_WALL = (5.75, 5.3, 3.9)
PLANT_MEMBRANE = (5.43, 4.97, 3.61)
#: still smaller than a real vacuole's share, for the same reason
PLANT_VACUOLE = (3.22, 2.88, 2.19)
PLANT_EXPONENT = 0.38
#: the cutaway removes everything above this height, like a microtome section
PLANT_CUT = (0.0, 0.0, 1.0)
PLANT_CUT_HEIGHT = 0.63
PLANT_VACUOLE_CUT_HEIGHT = 0.35
#: inner half-extents of the plasma membrane, i.e. the space an organelle may occupy
PLANT_INNER = (
    PLANT_MEMBRANE[0] / 2 - 0.05,
    PLANT_MEMBRANE[1] / 2 - 0.05,
    PLANT_MEMBRANE[2] / 2 - 0.05,
)


PLANT_CORNER_RADIUS = 0.46


def plant_shell(size, key: str, *, thickness: float, organelle: str, corner: float = PLANT_CORNER_RADIUS,
                cut: bool = True, seed: int = 5, displace_amount: float = 0.035, whole: bool = False,
                cut_height: float = PLANT_CUT_HEIGHT):
    """One layer of the plant cell envelope: wall, plasma membrane or vacuole."""
    verts, faces = ck.rounded_box(size, corner, 80, 40)
    obj = ck.new_object(f"{organelle}_surface", verts, faces, mat(key))
    ck.displace(obj, displace_amount, 0.75, seed=seed)
    if cut:
        ck.cut_plane(obj, (0.0, 0.0, cut_height), PLANT_CUT, keep="below")
    ck.solidify(obj, thickness)
    merged = ck.merge(organelle, [obj], organelle=organelle)
    if whole:
        merged["wholeShell"] = True
    return merged
