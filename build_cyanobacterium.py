"""Build the cyanobacterium specimen: a prokaryote with thylakoid membranes.

    blender --background --factory-startup --python build_cyanobacterium.py

Writes ``cyanobacterium.blend`` and ``public/cyanobacterium.glb``. Six
selectable structures: nucleoid, ribosomes, thylakoids, membrane, wall and
cytoplasm. The rod is sectioned lengthwise; the opening is a teaching cut, not
an anatomical feature — real cyanobacteria are closed.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import cellkit as ck  # noqa: E402
from build_cell import as_shell, clear_material_cache, cloud, mat  # noqa: E402

LENGTH = 5.4          # tip to tip, along X after the axis is rotated
RADIUS = 1.05
SECTION_Z = 0.02      # everything above this world height is removed
#: the capsule is built along local +Z and then laid along world +X, so a
#: lengthwise section is a plane whose local normal is -X
AXIS = Matrix.Rotation(math.radians(90), 4, "Y")  # +Z (capsule axis) -> +X
CUT_LOCAL = (-1.0, 0.0, 0.0)

#: each envelope layer as (palette key, radius factor, thickness, organelle key)
LAYERS = [
    ("envelope", 1.0, 0.14, "wall"),
    ("plasma", 0.935, 0.05, "membrane"),
    ("cytoplasm", 0.875, 0.05, "cytoplasm"),
]
#: nested thylakoid bowls, radius factor measured against RADIUS. They stay
#: clear of the cytoplasm bowl (0.875 minus its 0.05 thickness) so the closed
#: envelope never shows a thylakoid tip poking through it.
THYLAKOID_SHELLS = [0.80, 0.70, 0.60, 0.50]


def section_at(obj, height: float):
    """Cut the rod lengthwise at a world height, keeping the lower part."""
    ck.cut_plane(obj, (-height, 0.0, 0.0), CUT_LOCAL, keep="below")
    return obj


def shell(radius_factor: float, key: str, thickness: float, organelle: str, seed: int,
          section: bool = True):
    """One bowl of the envelope, or its closed counterpart when section=False."""
    verts, faces = ck.capsule(LENGTH * radius_factor, RADIUS * radius_factor, 76, 16)
    obj = ck.new_object(f"{organelle}_surface", verts, faces, mat(key))
    ck.displace(obj, 0.02, 0.9, seed=seed)
    if section:
        section_at(obj, SECTION_Z)
    ck.solidify(obj, thickness)
    obj.matrix_world = AXIS
    merged = ck.merge(organelle, [obj], organelle=organelle)
    return merged if section else as_shell(merged)


def build_envelope(rng: ck.Rng, *, section: bool = True):
    return [shell(factor, key, thickness, organelle, seed=7 + index, section=section)
            for index, (key, factor, thickness, organelle) in enumerate(LAYERS)]


def build_thylakoids(rng: ck.Rng):
    """Photosynthetic membranes: curved sheets stacked through the cytoplasm."""
    parts = []
    for index, factor in enumerate(THYLAKOID_SHELLS):
        verts, faces = ck.capsule(LENGTH * factor, RADIUS * factor, 72, 14)
        sheet = ck.new_object(f"thylakoid_{index}", verts, faces, mat("thylakoids"))
        ck.displace(sheet, 0.02, 1.1, seed=31 + index)
        section_at(sheet, SECTION_Z - 0.03 * index)
        ck.solidify(sheet, 0.022)
        sheet.matrix_world = AXIS
        parts.append(sheet)

    # phycobilisome-like granules sitting on the outermost thylakoid sheet
    outer = THYLAKOID_SHELLS[0]
    for index in range(70):
        along = rng.uniform(-LENGTH * outer * 0.46, LENGTH * outer * 0.46)
        angle = rng.uniform(0, math.tau)
        radial = RADIUS * outer * rng.uniform(0.55, 0.98)
        height = -RADIUS * outer * math.sqrt(max(0.0, 1 - (radial / (RADIUS * outer)) ** 2)) * 0.92
        verts, faces = ck.uv_sphere(rng.uniform(0.022, 0.032), 8, 6)
        parts.append(
            ck.new_object(
                f"phycobilisome_{index}", verts, faces, mat("phycobilisome"),
                matrix=ck.transform((along, radial * math.sin(angle) * 0.8, height + 0.05)),
            )
        )
    return ck.merge("thylakoids", parts, organelle="thylakoids")


def build_nucleoid(rng: ck.Rng):
    """The DNA region: one tangled closed loop, not a membrane-bound nucleus."""
    points = []
    steps = 120
    for step in range(steps + 1):
        t = step / steps * math.tau
        # uneven lobes and a vertical wobble keep it from reading as a tidy ring
        along = math.sin(t) * 1.15 + 0.30 * math.sin(3 * t + 0.7) + 0.14 * math.cos(5 * t) - 0.15
        across = 0.30 * math.cos(t) + 0.20 * math.cos(2 * t + 1.1) + 0.10 * math.sin(4 * t)
        height = -0.22 + 0.13 * math.sin(2 * t + 0.4) + 0.08 * math.cos(3 * t)
        points.append((along, across, height))
    verts, faces = ck.tube(points, 0.05, 10, caps=False)
    loop = ck.new_object("nucleoid_dna", verts, faces, mat("nucleoid"))
    # a loose end trailing across the cytoplasm, as in a real nucleoid
    tail = [(-1.05, 0.12, -0.24), (-1.5, -0.22, -0.34), (-1.72, 0.06, -0.4)]
    tail_verts, tail_faces = ck.tube(tail, [0.05, 0.04, 0.03], 10)
    parts = [loop, ck.new_object("nucleoid_tail", tail_verts, tail_faces, mat("nucleoid"))]
    return ck.merge("nucleoid", parts, organelle="nucleoid")


def build_ribosomes(rng: ck.Rng):
    """Free ribosomes: prokaryotes have them, which is the point of the specimen."""
    inner = THYLAKOID_SHELLS[-1]
    return cloud(
        rng, 165, 1.0, radius_range=(0.026, 0.04), centre=(0, 0, -0.24),
        scale=(LENGTH * inner * 0.46, RADIUS * inner * 0.74, RADIUS * inner * 0.42),
        organelle="ribosomes",
    )


def main() -> None:
    ck.reset_scene()
    clear_material_cache()
    rng = ck.Rng(20261002)

    objects = []
    objects.extend(build_envelope(rng))
    objects.append(build_thylakoids(rng))
    objects.append(build_nucleoid(rng))
    objects.append(build_ribosomes(rng))

    ck.report(
        "cyanobacterium",
        objects=len(bpy.data.objects),
        verts=sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH"),
        structures=sorted(o["organelle"] for o in bpy.data.objects if o.type == "MESH"),
    )
    ck.save_blend("cyanobacterium.blend")
    path = ck.export_glb("public/cyanobacterium.glb")
    print(f"[cellkit] EXPORTED cyanobacterium -> {path} ({path.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
