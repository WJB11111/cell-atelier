"""Build the detailed plant mesophyll cell specimen.

    blender --background --factory-startup --python build_plant_detailed.py

Writes ``plant-cell.blend`` and ``public/plant-cell.glb``. The cutaway model
carries the same nine selectable structures as the animal cell; the closed
envelope used by the "whole" view mode lives in ``build_plant_shells.py``.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import cellkit as ck  # noqa: E402
from build_cell import (  # noqa: E402
    PLANT_CORNER_RADIUS,
    PLANT_MEMBRANE,
    PLANT_VACUOLE,
    PLANT_VACUOLE_CUT_HEIGHT,
    PLANT_WALL,
    TAU,
    chloroplasts,
    clear_material_cache,
    cloud,
    er_network,
    golgi_stack,
    mat,
    mitochondria,
    nucleus,
    plant_shell,
)

CUT = (0.0, 0.0, 1.0)
NUCLEUS_CENTRE = Vector((-1.98, -1.27, -0.35))
#: A mesophyll nucleus is about 10 µm across; at 1 unit ≈ 10.6 µm this radius
#: gives 11 µm, and it leaves the nucleus clear of both the vacuole and the
#: envelope instead of half-buried in the vacuole.
NUCLEUS_RADIUS = 0.52

#: Organelles live in the peripheral ring between the vacuole and the envelope.
#:
#: The ring is only about 0.9 wide (vacuole half-extent 1.4, membrane inner
#: surface 2.31 along x) and it is not a circle — both bodies are rounded boxes,
#: so the band is wide along the axes and narrow diagonally. A chloroplast
#: therefore has to lie with its long axis *tangent* to the ring, which is also
#: how they sit in a real mesophyll cell, flattened against the tonoplast. Scale
#: 0.36 makes one about 1.1 units long, i.e. roughly twice life size (a real one
#: is ~5 µm in a 50 µm cell): the model keeps a modest exaggeration so the grana
#: stay readable, and the specimen note says so.
CHLOROPLAST_SCALE = 0.36
MITOCHONDRION_SCALE = 0.30
#: radial half-size of each body: what has to clear the vacuole and the envelope
CHLOROPLAST_EXTENT = 0.72 * CHLOROPLAST_SCALE + 0.06
MITOCHONDRION_EXTENT = 1.05 * MITOCHONDRION_SCALE + 0.06


def ring_slot(degrees, extent, *, z, low=0.30, high=2.60):
    """Radius at the middle of the free band along one direction.

    Walks outward from the vacuole and returns the centre of the stretch where a
    body of this radial half-size clears the vacuole and stays inside the
    envelope. A fixed radius put chloroplasts into the vacuole's rounded corner.
    """
    angle = math.radians(degrees)
    direction = (math.cos(angle), math.sin(angle))
    first = last = None
    radius = low
    while radius <= high:
        point = (direction[0] * radius, direction[1] * radius, z)
        clear_vacuole = ck.rounded_box_sdf(point, PLANT_VACUOLE, PLANT_CORNER_RADIUS) >= extent + 0.05
        inside_membrane = ck.rounded_box_sdf(point, PLANT_MEMBRANE, PLANT_CORNER_RADIUS) <= -(extent + 0.05)
        if clear_vacuole and inside_membrane:
            first = radius if first is None else first
            last = radius
        radius += 0.01
    if first is None:
        raise ValueError(f"no room for a body of radial extent {extent} at {degrees}°")
    return (first + last) / 2


def ring_placements(count, extent, scale, *, z=-0.10, start=0.0, tilt=0.10, radial=False):
    """Evenly spaced placements in the peripheral ring, long axis along the ring."""
    angles = [math.degrees(start + TAU * index / count) for index in range(count)]
    return ring_angles(angles, extent, scale, z=z, tilt=tilt, radial=radial)


def ring_angles(degrees, extent, scale, *, z=-0.10, tilt=0.10, radial=False):
    """Placements at explicit angles, each centred in the free band.

    ``radial`` points the long axis outward instead of along the ring: the eight
    chloroplasts cover most of the circumference, so a mitochondrion only fits
    between them lying across the ring. ``extent`` is the body's half-size in the
    radial direction, which is what has to clear the vacuole and the envelope.
    """
    plans = []
    for value in degrees:
        angle = math.radians(value)
        radius = ring_slot(value, extent, z=z)
        location = (radius * math.cos(angle), radius * math.sin(angle), z)
        heading = angle if radial else angle + math.pi / 2
        rotation = (tilt, -tilt * 0.5, heading)
        plans.append((location, rotation, scale))
    return plans


def slot_point(degrees, extent, *, z):
    """Centre of the free band along one direction, as an (x, y, z) tuple."""
    angle = math.radians(degrees)
    radius = ring_slot(degrees, extent, z=z)
    return (radius * math.cos(angle), radius * math.sin(angle), z)


#: Eight bodies on the ring would cover the circumference and leave no gap for
#: the mitochondria and the Golgi, which then get shoved out through the
#: envelope. Six leaves a free arc of about 0.9 between neighbours. The count is
#: a deliberate simplification (a real mesophyll cell has 30-50) noted in the
#: specimen's field note.
CHLOROPLAST_PLACEMENTS = ring_placements(6, CHLOROPLAST_EXTENT, CHLOROPLAST_SCALE, start=0.22) + [
    # two more resting on top of the vacuole's cut, where the section opens out
    (slot_point(100, CHLOROPLAST_EXTENT, z=0.40), (0.5, -0.2, math.radians(160)), CHLOROPLAST_SCALE * 0.94),
    (slot_point(-55, CHLOROPLAST_EXTENT, z=0.38), (-0.45, 0.25, math.radians(-30)), CHLOROPLAST_SCALE * 0.94),
]

#: The six chloroplasts sit at 12.6° + 60° k, so their gaps are at 42.6° + 60° k.
#: The mitochondria and the Golgi each take one gap: sharing an angle is what put
#: the Golgi inside a mitochondrion. 222.6° is left for the nucleus and 102.6° for
#: the Golgi.
MITO_PLACEMENTS = ring_angles([42.6, 162.6, 282.6, 342.6], MITOCHONDRION_EXTENT,
                              MITOCHONDRION_SCALE, z=-0.34, radial=True)

#: the Golgi is placed in the band like everything else, from its own extent. It
#: sits low in its gap: the chloroplast resting on the vacuole's cut shares this
#: angle, and separating them in z is what keeps the two apart.
GOLGI_CENTRE = slot_point(102.6, 0.40, z=-0.45)




def build_vacuole():
    return plant_shell(PLANT_VACUOLE, "vacuole", thickness=0.05, organelle="vacuole",
                       cut_height=PLANT_VACUOLE_CUT_HEIGHT)


def build_outer_layers():
    wall = plant_shell(PLANT_WALL, "wall", thickness=0.13, organelle="wall", seed=11)
    membrane = plant_shell(PLANT_MEMBRANE, "plant_membrane", thickness=0.045,
                           organelle="membrane", seed=13, displace_amount=0.03)
    return wall, membrane


def main() -> None:
    ck.reset_scene()
    clear_material_cache()
    rng = ck.Rng(20261001)

    # The vacuole fills the middle, so everything else lives in the peripheral
    # ring: each structure is placed around the ones already there and then
    # pulled back inside the plasma membrane.
    objects = []
    wall, membrane = build_outer_layers()
    objects.extend([wall, membrane])

    vacuole = build_vacuole()
    objects.append(vacuole)

    cell_nucleus, nucleolus = nucleus(NUCLEUS_CENTRE, NUCLEUS_RADIUS, rng, cut_normal=CUT)
    ck.contain(cell_nucleus, membrane, margin=0.1)
    ck.contain(nucleolus, membrane, margin=0.1)
    objects.extend([cell_nucleus, nucleolus])

    # The ER hugs the nucleus tightly: the cell is a box and the nucleus already
    # sits near one corner, so a sprawling network would cross the envelope.
    # max_reach bounds the smooth-ER tubules, which otherwise spiral out of the
    # cell — measured from the origin, and the nucleus is 1.75 out.
    rough, smooth, dots = er_network(NUCLEUS_CENTRE, NUCLEUS_RADIUS, rng, sheets=3, tubes=2,
                                     ribosome_dots=36, sheet_width=0.44, spread=0.95,
                                     max_reach=2.2,
                                     avoid_spheres=ck.obstacle_spheres([vacuole, cell_nucleus]))
    merged_er = ck.merge("er", rough + smooth, organelle="er")
    objects.append(merged_er)

    golgi_source = golgi_stack(rng, span=0.26)
    golgi = ck.place_free(golgi_source, ck.transform(GOLGI_CENTRE, (0.4, 0.15, math.radians(-38))),
                          [vacuole, cell_nucleus, nucleolus, merged_er], margin=0.02,
                          samples=200, max_offset=0.15)
    ck.discard(golgi_source)
    golgi["organelle"] = "golgi"
    objects.append(golgi)

    chloroplast = chloroplasts(CHLOROPLAST_PLACEMENTS, rng)
    objects.append(chloroplast)

    # placed around everything already in the cell, but the search is capped: the
    # ring slots are computed to fit, so a large escape would only undo that
    mito = mitochondria(MITO_PLACEMENTS, rng,
                        obstacles=[vacuole, cell_nucleus, nucleolus, merged_er, golgi, chloroplast],
                        margin=0.02, max_offset=0.15)
    objects.append(mito)

    occupiers = ck.obstacle_spheres([vacuole, cell_nucleus, nucleolus, golgi, chloroplast, mito])
    ribosomes = cloud(rng, 130, 1.0, radius_range=(0.028, 0.042), centre=(0, 0, -0.36),
                      scale=(2.5, 2.25, 0.86), avoid_spheres=occupiers, organelle="ribosomes")
    ribosomes = ck.merge("ribosomes", [ribosomes] + dots, organelle="ribosomes")
    objects.append(ribosomes)

    ck.report(
        "plant-cell",
        objects=len(bpy.data.objects),
        verts=sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH"),
        structures=sorted(o["organelle"] for o in bpy.data.objects if o.type == "MESH"),
    )
    ck.save_blend("plant-cell.blend")
    path = ck.export_glb("public/plant-cell.glb")
    print(f"[cellkit] EXPORTED plant-cell -> {path} ({path.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
