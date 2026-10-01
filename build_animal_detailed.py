"""Build the detailed animal cell specimen.

    blender --background --factory-startup --python build_animal_detailed.py

Writes ``animal-cell.blend`` and ``public/animal-cell.glb``. Nine selectable
structures are exported, each one a single mesh carrying its ``organelle``
identifier: nucleus, mitochondria, er, golgi, membrane, fibers, centrioles,
vesicles and ribosomes.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import cellkit as ck  # noqa: E402
from build_cell import (  # noqa: E402
    TAU,
    as_shell,
    clamp_to_cell,
    clear_material_cache,
    cloud,
    er_network,
    fluted_tube,
    golgi_stack,
    mat,
    mitochondria,
    nucleus,
)

CELL_RADIUS = 3.0
NUCLEUS_CENTRE = Vector((-0.62, 0.12, -0.12))
NUCLEUS_RADIUS = 1.16
CUT = (0, -1.0, 0.85)  # opening faces the viewer: front (-Y) and top (+Z)
GOLGI_CENTRE = (0.85, -1.35, -0.75)
CENTRIOLE_CENTRE = (1.05, -0.95, 0.55)

#: (location, rotation, scale) for every mitochondrion in the specimen.
#: Two constraints hold for every entry, and the audit in
#: tools/check_intersections.py is what verifies them:
#:   * |location - NUCLEUS_CENTRE| > nucleus radius + extent, so none of them
#:     starts buried in the nucleus;
#:   * |location| + 0.85 * scale < 2.8, so no tip leaves the plasma membrane.
MITO_PLACEMENTS = [
    ((1.55, -0.90, 0.55), (0.35, 0.2, math.radians(-28)), 1.0),
    ((1.30, 1.00, 0.40), (0.2, 0.5, math.radians(62)), 0.95),
    ((0.20, -1.75, 0.45), (0.4, -0.3, math.radians(14)), 0.9),
    ((1.85, 0.30, -0.55), (-0.25, 0.35, math.radians(96)), 0.85),
    ((0.75, 1.70, -0.80), (0.5, 0.15, math.radians(-46)), 0.95),
    ((0.30, -1.30, -1.35), (-0.35, 0.45, math.radians(28)), 0.85),
    ((-0.20, 0.55, 1.90), (0.2, -0.55, math.radians(-8)), 0.8),
]


def build_membrane(rng: ck.Rng, *, section: bool = True):
    """Outer plasma membrane.

    ``section=False`` builds the closed envelope used by the "whole" and
    "transparent" view modes: identical vertices, displacement and thickness,
    just without the teaching cut, so switching modes never makes the surface
    jump.
    """
    verts, faces = ck.uv_sphere(CELL_RADIUS, 72, 36)
    membrane = ck.new_object("membrane", verts, faces, mat("membrane"))
    ck.displace(membrane, 0.055, 0.9, seed=17)
    if section:
        normal = Vector(CUT).normalized()
        ck.cut_plane(membrane, tuple(normal * CELL_RADIUS * 0.62), CUT, keep="below")
    ck.solidify(membrane, 0.05)
    merged = ck.merge("membrane", [membrane], organelle="membrane")
    return merged if section else as_shell(merged)


def build_cytoskeleton(rng: ck.Rng, obstacles=()):
    """Thin filament network hugging the inside of the membrane.

    Real cortical cytoskeleton sits just under the plasma membrane rather than
    criss-crossing the middle of the cell, so each strand is an arc along the
    periphery. That also keeps the interior readable: strands no longer cut
    across the nucleus and the organelles.
    """
    spheres = ck.obstacle_spheres(obstacles)
    parts = []
    for i in range(9):
        # two points on a shell just inside the membrane, joined by an arc that
        # bulges along the same shell
        start = rng.point_in_ball(CELL_RADIUS, min_radius=CELL_RADIUS * 0.86)
        end = rng.point_in_ball(CELL_RADIUS, min_radius=CELL_RADIUS * 0.86)
        while (end - start).length < CELL_RADIUS * 0.7:
            end = rng.point_in_ball(CELL_RADIUS, min_radius=CELL_RADIUS * 0.86)
        control = (start + end).normalized() * rng.uniform(CELL_RADIUS * 0.88, CELL_RADIUS * 0.99)
        points = []
        for k in range(13):
            t = k / 12
            points.append(start * (1 - t) ** 2 + control * 2 * (1 - t) * t + end * t * t)
        radius = rng.uniform(0.014, 0.022)
        if spheres:
            points = ck.retreat_polyline_spheres(ck.densify(points, 6), spheres,
                                                 margin=radius + 0.07)
            points = clamp_to_cell(points, CELL_RADIUS - 0.1)
        verts, faces = ck.tube([tuple(p) for p in points], radius, 8)
        parts.append(ck.new_object(f"fiber_{i}", verts, faces, mat("fibers")))
    return ck.merge("fibers", parts, organelle="fibers")


def build_centrioles(rng: ck.Rng):
    """A near-perpendicular pair of centrioles."""
    parts = []
    base = Vector((1.05, -0.95, 0.55))
    for i, (offset, rotation) in enumerate(
        (
            ((0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            ((0.34, 0.12, 0.02), (math.radians(84), math.radians(12), math.radians(20))),
        )
    ):
        verts, faces = fluted_tube(0.155, 0.5, inner=0.085, lobes=9, depth=0.09)
        parts.append(
            ck.new_object(
                f"centriole_{i}",
                verts,
                faces,
                mat("centrioles"),
                matrix=ck.transform(tuple(base + Vector(offset)), rotation),
            )
        )
        # the perpendicular daughter sits slightly offset, as in a centrosome
    return ck.merge("centrioles", parts, organelle="centrioles")


def build_mitochondria(rng: ck.Rng, obstacles=()):
    return mitochondria(MITO_PLACEMENTS, rng, obstacles=obstacles, margin=0.1)


def build_er(rng: ck.Rng, avoid_spheres=()):
    # max_reach is measured from the cell centre and keeps the smooth ER inside
    # the plasma membrane (radius 3.0 at its thinnest after noise);
    # avoid_spheres keeps it from threading through the mitochondria and Golgi
    rough, smooth, dots = er_network(NUCLEUS_CENTRE, NUCLEUS_RADIUS, rng,
                                     max_reach=2.45, avoid_spheres=avoid_spheres)
    merged_er = ck.merge("er", rough + smooth, organelle="er")
    return merged_er, ck.merge("ribosomes", dots, organelle="ribosomes") if dots else None


def main() -> None:
    ck.reset_scene()
    clear_material_cache()
    rng = ck.Rng(20260930)

    # Placement order matters: the large structures are positioned first and
    # everything drawn later wraps around them, so nothing ends up buried
    # inside something else. Each step ends with `contain`, because avoiding one
    # neighbour can push a structure out through the plasma membrane.
    objects = []
    membrane = build_membrane(rng)
    objects.append(membrane)

    cell_nucleus, nucleolus = nucleus(NUCLEUS_CENTRE, NUCLEUS_RADIUS, rng, cut_normal=CUT)
    objects.extend([cell_nucleus, nucleolus])

    # compact organelles are hand-placed for composition, then deconflicted
    mito = build_mitochondria(rng, [cell_nucleus, nucleolus])
    ck.contain(mito, membrane, margin=0.08)
    objects.append(mito)

    golgi_source = golgi_stack(rng)
    golgi = ck.place_free(golgi_source, ck.transform(GOLGI_CENTRE, (0.35, 0.2, math.radians(24))),
                          [cell_nucleus, nucleolus, mito], margin=0.02, samples=220)
    ck.discard(golgi_source)
    ck.contain(golgi, membrane, margin=0.08)
    golgi["organelle"] = "golgi"
    objects.append(golgi)

    centrioles_source = build_centrioles(rng)
    centrioles = ck.place_free(centrioles_source, Matrix.Identity(4),
                               [cell_nucleus, nucleolus, mito, golgi], margin=0.02, samples=200)
    ck.discard(centrioles_source)
    ck.contain(centrioles, membrane, margin=0.08)
    centrioles["organelle"] = "centrioles"
    objects.append(centrioles)

    anchored = [cell_nucleus, nucleolus, mito, golgi, centrioles]

    merged_er, er_ribosomes = build_er(rng, avoid_spheres=ck.obstacle_spheres(anchored))
    objects.append(merged_er)

    fibers = build_cytoskeleton(rng, anchored)
    objects.append(fibers)
    # ribosomes and vesicles fill the cytoplasm but never sit inside a structure.
    # Filaments are left out of the occupancy: free ribosomes really do sit among
    # them, and a fibre's island sphere would otherwise block most of the cell.
    occupiers = ck.obstacle_spheres(anchored)
    free_ribosomes = cloud(rng, 150, CELL_RADIUS * 0.93, radius_range=(0.032, 0.05),
                           avoid_spheres=occupiers, organelle="ribosomes")
    if er_ribosomes is not None:
        free_ribosomes = ck.merge("ribosomes", [free_ribosomes, er_ribosomes], organelle="ribosomes")
    objects.append(free_ribosomes)

    vesicles = cloud(rng, 14, CELL_RADIUS * 0.8, radius_range=(0.055, 0.105),
                     avoid_spheres=occupiers, organelle="vesicles")
    objects.append(vesicles)

    ck.report(
        "animal-cell",
        objects=len(bpy.data.objects),
        verts=sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH"),
        structures=sorted(o["organelle"] for o in bpy.data.objects if o.type == "MESH"),
    )
    ck.save_blend("animal-cell.blend")
    path = ck.export_glb("public/animal-cell.glb")
    print(f"[cellkit] EXPORTED animal-cell -> {path} ({path.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
