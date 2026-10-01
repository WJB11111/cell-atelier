"""Build the myelinated neuron specimen.

    blender --background --factory-startup --python build_neuron.py

Writes ``neuron.blend`` and ``public/neuron.glb``. Seven selectable structures:
soma, nucleus, dendrites, axon, myelin, terminals and membrane. The soma and
nucleus are sectioned; the membrane is modelled for the soma only, while the
real plasma membrane is continuous over every process.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Euler, Matrix, Vector  # noqa: E402

import cellkit as ck  # noqa: E402
from build_cell import as_shell, clear_material_cache, mat  # noqa: E402

SOMA_CENTRE = Vector((-3.05, 0.0, 0.30))
SOMA_SIZE = (1.40, 1.08, 0.64)
CUT = (0.0, -0.30, 1.0)
SECTION_Z = 0.62

AXON_START = Vector((-1.72, 0.05, 0.26))
AXON_END = Vector((3.15, -0.25, -0.62))
MYELIN_SEGMENTS = 8


# ---------------------------------------------------------------- soma


def build_soma(rng: ck.Rng):
    """The cell body, sectioned so the nucleus and cytoplasm are visible."""
    verts, faces = ck.uv_sphere(1.0, 72, 36)
    scaled = [(v[0] * SOMA_SIZE[0], v[1] * SOMA_SIZE[1], v[2] * SOMA_SIZE[2]) for v in verts]
    body = ck.new_object("soma_body", scaled, faces, mat("soma"),
                         matrix=ck.transform(tuple(SOMA_CENTRE)))
    ck.displace(body, 0.045, 2.0, seed=13)
    ck.cut_plane(body, (0, 0, SECTION_Z), CUT, keep="below")
    ck.solidify(body, 0.09)
    return ck.merge("soma", [body], organelle="soma")


def build_membrane(rng: ck.Rng, *, section: bool = True):
    """The soma's plasma membrane: a thin layer just outside the sectioned body.

    ``section=False`` returns the closed envelope used by the "whole" and
    "transparent" view modes — the real membrane also covers every process, this
    model only groups the soma's.
    """
    verts, faces = ck.uv_sphere(1.0, 72, 36)
    scaled = [
        (v[0] * SOMA_SIZE[0] * 1.025, v[1] * SOMA_SIZE[1] * 1.025, v[2] * SOMA_SIZE[2] * 1.025)
        for v in verts
    ]
    shell = ck.new_object("soma_membrane", scaled, faces, mat("membrane"),
                          matrix=ck.transform(tuple(SOMA_CENTRE)))
    ck.displace(shell, 0.04, 2.0, seed=13)
    if section:
        ck.cut_plane(shell, (0, 0, SECTION_Z + 0.02), CUT, keep="below")
    ck.solidify(shell, 0.03)
    merged = ck.merge("membrane", [shell], organelle="membrane")
    return merged if section else as_shell(merged)


def build_nucleus(rng: ck.Rng):
    """A sectioned nucleus with its nucleolus, sitting in the soma."""
    verts, faces = ck.uv_sphere(1.0, 56, 28)
    size = (0.66, 0.54, 0.36)
    scaled = [(v[0] * size[0], v[1] * size[1], v[2] * size[2]) for v in verts]
    centre = SOMA_CENTRE + Vector((-0.04, 0.02, -0.12))
    shell = ck.new_object("nucleus_shell", scaled, faces, mat("nucleus"),
                          matrix=ck.transform(tuple(centre)))
    ck.cut_plane(shell, (0, 0, SECTION_Z - 0.20), CUT, keep="below")
    ck.solidify(shell, 0.045)
    nucleolus = ck.new_object(
        "nucleolus", *ck.uv_sphere(0.22, 24, 14), mat("nucleolus"),
        matrix=ck.transform(tuple(centre + Vector((-0.03, 0.02, 0.16)))),
        organelle="nucleolus",
    )
    return ck.merge("nucleus", [shell], organelle="nucleus"), nucleolus


# ---------------------------------------------------------------- processes


def branch(parts, start: Vector, direction: Vector, length: float, radius: float,
           depth: int, rng: ck.Rng, index: list[int]):
    """One tapering dendrite segment, then two or three children."""
    direction = direction.normalized()
    bend = Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(-0.25, 0.4)))
    end = start + direction * length + bend * length * 0.35
    middle = (start + end) / 2 + bend * length * 0.3
    verts, faces = ck.tube([tuple(start), tuple(middle), tuple(end)],
                           [radius, radius * 0.82, radius * 0.66], 9)
    index[0] += 1
    parts.append(ck.new_object(f"dendrite_{index[0]}", verts, faces, mat("dendrites")))

    if depth <= 0:
        # a small knob at the tip, the way a dendrite ends in a spine cluster
        verts, faces = ck.uv_sphere(radius * 0.9, 10, 7)
        parts.append(ck.new_object(f"dendrite_tip_{index[0]}", verts, faces, mat("dendrites"),
                                   matrix=ck.transform(tuple(end))))
        return

    for child in range(rng.uniform(0, 1) > 0.35 and 2 or 3):
        axis = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))).normalized()
        turned = direction.copy()
        turned.rotate(Matrix.Rotation(rng.uniform(0.45, 0.95), 4, axis))
        branch(parts, end, turned, length * rng.uniform(0.6, 0.78), radius * 0.7,
               depth - 1, rng, index)


def build_dendrites(rng: ck.Rng):
    """An apical tuft fanning away from the soma."""
    parts = []
    index = [0]
    trunks = 12
    for trunk in range(trunks):
        spread = (trunk / (trunks - 1)) - 0.5
        direction = Vector((
            -0.8 + rng.uniform(-0.2, 0.2),
            spread * 2.0 + rng.uniform(-0.25, 0.25),
            0.7 * math.cos(spread * 2.6) + rng.uniform(-0.3, 0.3),
        )).normalized()
        # starting inside the soma wall hides the tube cap and lets the trunk
        # emerge from the surface instead of poking into the sectioned bowl;
        # the height clamp keeps the start below the cut, where wall exists
        start = SOMA_CENTRE + Vector((
            direction.x * SOMA_SIZE[0] * 0.97,
            direction.y * SOMA_SIZE[1] * 0.97,
            direction.z * SOMA_SIZE[2] * 0.97,
        ))
        start.z = min(start.z, SECTION_Z - 0.22)
        branch(parts, start, direction, rng.uniform(1.0, 1.35), rng.uniform(0.085, 0.115),
               3, rng, index)
    return ck.merge("dendrites", parts, organelle="dendrites")


def axon_points(samples: int = 60):
    """A gently curving axon path from the hillock to the terminals."""
    points = []
    for step in range(samples + 1):
        t = step / samples
        base = AXON_START.lerp(AXON_END, t)
        sag = math.sin(t * math.pi) * 0.18
        points.append(base + Vector((0.0, 0.12 * math.sin(t * 2.4), -sag)))
    return points


def build_axon(rng: ck.Rng):
    points = axon_points()
    radii = [0.145 - 0.055 * (i / (len(points) - 1)) for i in range(len(points))]
    verts, faces = ck.tube([tuple(p) for p in points], radii, 14)
    return ck.merge("axon", [ck.new_object("axon_tube", verts, faces, mat("axon"))],
                    organelle="axon")


def build_myelin(rng: ck.Rng):
    """Segmented sheath with nodes of Ranvier between the segments."""
    points = axon_points(120)
    parts = []
    span = len(points) - 1
    gap = 0.55  # in samples, so the nodes stay visible
    segment = (span - gap * (MYELIN_SEGMENTS - 1)) / MYELIN_SEGMENTS
    for index in range(MYELIN_SEGMENTS):
        first = int(index * (segment + gap))
        last = int(min(span, first + segment))
        path = [tuple(p) for p in points[first:last + 1]]
        if len(path) < 2:
            continue
        taper = 1.0 - 0.22 * index / max(1, MYELIN_SEGMENTS - 1)
        radii = []
        span_samples = max(1, len(path) - 1)
        for step in range(len(path)):
            # rounded ends so a segment reads as an internode, not a box
            edge = min(step, span_samples - step) / max(1.0, span_samples * 0.14)
            radii.append(0.34 * taper * (0.62 + 0.38 * min(1.0, edge)))
        verts, faces = ck.tube(path, radii, 20)
        parts.append(ck.new_object(f"myelin_{index}", verts, faces, mat("myelin")))
    return ck.merge("myelin", parts, organelle="myelin")


def build_terminals(rng: ck.Rng):
    """The axon's end: terminal branches, each ending in a bouton."""
    parts = []
    end = Vector(axon_points()[-1])
    incoming = (end - Vector(axon_points()[-6])).normalized()
    for index in range(7):
        spread = (index / 6) - 0.5
        direction = Vector((
            0.7 + rng.uniform(-0.12, 0.12),
            spread * 1.5,
            spread * 1.1 + rng.uniform(-0.45, 0.45),
        )).normalized()
        direction = (direction + incoming * 0.4).normalized()
        tip = end + direction * rng.uniform(0.8, 1.15)
        middle = (end + tip) / 2 + Vector((0, rng.uniform(-0.1, 0.1), rng.uniform(-0.15, 0.15)))
        verts, faces = ck.tube([tuple(end), tuple(middle), tuple(tip)],
                               [0.075, 0.05, 0.032], 9)
        parts.append(ck.new_object(f"terminal_{index}", verts, faces, mat("terminals")))
        verts, faces = ck.uv_sphere(0.095, 14, 9)
        parts.append(ck.new_object(f"bouton_{index}", verts, faces, mat("terminals"),
                                   matrix=ck.transform(tuple(tip))))
    return ck.merge("terminals", parts, organelle="terminals")


def main() -> None:
    ck.reset_scene()
    clear_material_cache()
    rng = ck.Rng(20261004)

    cell_nucleus, nucleolus = build_nucleus(rng)
    objects = [
        build_membrane(rng),
        build_soma(rng),
        cell_nucleus,
        nucleolus,
        build_dendrites(rng),
        build_axon(rng),
        build_myelin(rng),
        build_terminals(rng),
    ]

    ck.report(
        "neuron",
        objects=len(bpy.data.objects),
        verts=sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH"),
        structures=sorted(o["organelle"] for o in bpy.data.objects if o.type == "MESH"),
    )
    ck.save_blend("neuron.blend")
    path = ck.export_glb("public/neuron.glb")
    print(f"[cellkit] EXPORTED neuron -> {path} ({path.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
