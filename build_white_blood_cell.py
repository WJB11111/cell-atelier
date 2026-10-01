"""Build the neutrophil (white blood cell) specimen.

    blender --background --factory-startup --python build_white_blood_cell.py

Writes ``white-blood-cell.blend`` and ``public/white-blood-cell.glb``. Four
selectable structures: nucleus, granules, mitochondria and membrane. The
specimen is one neutrophil, not "the" white blood cell: lymphocytes, monocytes
and eosinophils look completely different.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import cellkit as ck  # noqa: E402
from build_cell import as_shell, clear_material_cache, cloud, mat, mitochondria  # noqa: E402

CELL_RADIUS = 2.9
SECTION_Z = 0.62
CUT = (0.0, -0.35, 1.0)

NUCLEUS_LOBES = [
    ((-0.86, 0.38, 0.05), 0.72),
    ((0.42, -0.62, 0.22), 0.70),
    ((0.52, 0.66, -0.28), 0.64),
]

#: Kept close enough to the centre that no tip reaches the wavy membrane, whose
#: radius dips to about 2.45 after the two displacement passes.
MITO_PLACEMENTS = [
    ((-1.50, -0.45, -0.40), (0.30, 0.25, math.radians(-24)), 0.85),
    ((1.60, 0.10, -0.25), (-0.25, 0.20, math.radians(150)), 0.8),
    ((0.10, -1.50, -0.45), (0.35, -0.15, math.radians(72)), 0.75),
]


def build_membrane(rng: ck.Rng, *, section: bool = True):
    """Irregular amoeboid surface with a thick sectioned rim and short processes.

    ``section=False`` returns the closed envelope used by the "whole" and
    "transparent" view modes: same noise seeds, same processes, no cut. Call it
    with a freshly seeded ``Rng`` so the processes land in the same places.
    """
    verts, faces = ck.uv_sphere(CELL_RADIUS, 96, 48)
    squashed = [(v[0], v[1], v[2] * 0.82) for v in verts]
    blob = ck.new_object("membrane_surface", squashed, faces, mat("membrane"))
    # coarse noise gives the wavy outline of a crawling neutrophil
    ck.displace(blob, 0.34, 0.55, seed=23)
    ck.displace(blob, 0.12, 1.7, seed=24)
    if section:
        ck.cut_plane(blob, (0, 0, SECTION_Z), CUT, keep="below")
    ck.solidify(blob, 0.13)
    parts = [blob]

    # stubby surface processes: the leading edge of a migrating neutrophil
    for index in range(14):
        angle = rng.uniform(0, math.tau)
        tilt = rng.uniform(-0.5, 0.7)
        direction = Vector((math.cos(angle), math.sin(angle), tilt)).normalized()
        radius = CELL_RADIUS * 0.82
        start = direction * radius
        end = start + direction * rng.uniform(0.35, 0.7)
        verts, faces = ck.tube([tuple(start), tuple(end)], [0.13, 0.1], 10)
        parts.append(ck.new_object(f"process_{index}", verts, faces, mat("membrane")))
    merged = ck.merge("membrane", parts, organelle="membrane")
    return merged if section else as_shell(merged)


def build_nucleus(rng: ck.Rng):
    """A lobed nucleus: several lobes joined by narrow bridges, not a sphere."""
    parts = []
    for index, (centre, radius) in enumerate(NUCLEUS_LOBES):
        verts, faces = ck.uv_sphere(radius, 48, 24)
        lobe = ck.new_object(f"lobe_{index}", verts, faces, mat("nucleus"),
                             matrix=ck.transform(centre))
        ck.displace(lobe, radius * 0.035, 2.2, seed=41 + index)
        parts.append(lobe)

    # bridges between consecutive lobes so the whole reads as one nucleus
    for index in range(len(NUCLEUS_LOBES) - 1):
        start = Vector(NUCLEUS_LOBES[index][0])
        end = Vector(NUCLEUS_LOBES[index + 1][0])
        direction = (end - start).normalized()
        neck = [tuple(start + direction * 0.35), tuple(end - direction * 0.35)]
        verts, faces = ck.tube(neck, [0.34, 0.32], 16)
        parts.append(ck.new_object(f"bridge_{index}", verts, faces, mat("nucleus")))
    return ck.merge("nucleus", parts, organelle="nucleus")


def main() -> None:
    ck.reset_scene()
    clear_material_cache()
    rng = ck.Rng(20261003)

    objects = [build_membrane(rng)]
    cell_nucleus = build_nucleus(rng)
    objects.append(cell_nucleus)

    # the mitochondria and granules are placed around the lobed nucleus and each
    # other, so none of them ends up buried in a lobe
    mito = mitochondria(MITO_PLACEMENTS, rng, obstacles=[cell_nucleus], margin=0.02)
    ck.contain(mito, objects[0], margin=0.1)
    objects.append(mito)

    occupiers = ck.obstacle_spheres([cell_nucleus, mito])
    granules = cloud(rng, 150, 1.0, radius_range=(0.045, 0.125), centre=(0, 0, -0.35),
                     scale=(2.0, 2.0, 1.0),
                     exclude=[(centre, radius + 0.12) for centre, radius in NUCLEUS_LOBES],
                     avoid_spheres=occupiers, organelle="granules")
    objects.append(granules)

    ck.report(
        "white-blood-cell",
        objects=len(bpy.data.objects),
        verts=sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH"),
        structures=sorted(o["organelle"] for o in bpy.data.objects if o.type == "MESH"),
    )
    ck.save_blend("white-blood-cell.blend")
    path = ck.export_glb("public/white-blood-cell.glb")
    print(f"[cellkit] EXPORTED white-blood-cell -> {path} ({path.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
