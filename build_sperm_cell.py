"""Build the human sperm cell specimen.

    blender --background --factory-startup --python build_sperm_cell.py

Writes ``sperm-cell.blend`` and ``public/sperm-cell.glb``. Four selectable
structures are exported, each one a single mesh carrying its ``organelle`` key:

* ``acrosome``     — the rose cap over the front of the head, colour ``#d9878f``;
* ``nucleus``      — the condensed haploid nucleus that forms the head, ``#755894``;
* ``mitochondria`` — the helical sheath of paired beads around the midpiece, ``#ce7b4e``;
* ``flagellum``    — the tapering, gently undulating tail, colour ``#6f9eaa``.

The cell lies along +X with the head at −X: head −4.50 … −2.80, midpiece
−2.80 … −1.70, tail out to +4.61, so the whole specimen is 9.1 units long and
centred on the origin (the viewer orbits the origin, it never re-centres a model).

The head carries no envelope of its own. The nucleus *is* the head volume and the
acrosome is a thin shell that covers its front and overshoots the tip by a hair, so
both structures read clearly without a cutaway: the brief's alternative — folding
the head surface into the ``acrosome`` object — would have made the acrosome entry
light up the whole head, which is not what the cap is. There is no cutaway
anywhere in this specimen, so every surface is closed and nothing shows a back face.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import cellkit as ck  # noqa: E402

TAU = math.tau

# --------------------------------------------------------------------------
# layout along +X (Blender units)
# --------------------------------------------------------------------------

HEAD_CENTRE = Vector((-3.60, 0.0, 0.0))
#: semi-axes of the head: 1.6 long, 1.0 wide, 0.9 thick
HEAD = (0.80, 0.50, 0.45)
#: the front of the head is slimmer, so it reads as an ovoid rather than an egg
HEAD_TAPER = 0.20

#: the acrosome is a hair larger and 0.10 longer than the head, so its tip pokes
#: out in front and its rim stands proud of the surface behind it
ACROSOME = (0.90, 0.535, 0.48)
#: cut plane (relative to the head centre): the cap covers the front ~47 %
ACROSOME_CUT = -0.14
ACROSOME_SHELL = 0.030

#: the midpiece starts at the back of the head and carries the mitochondrial sheath.
#: The reference render gives the helix about 1.1 units, not 0.5: any shorter and
#: three and a half turns of chunky beads collapse into a solid ring.
MIDPIECE_START = HEAD_CENTRE.x + HEAD[0]
MIDPIECE_LENGTH = 1.10
MIDPIECE_END = MIDPIECE_START + MIDPIECE_LENGTH

#: the flagellum starts buried inside the head so the neck has no seam
TAIL_START = HEAD_CENTRE.x + 0.65
TAIL_END = 4.60
TAIL_SAMPLES = 160
TAIL_SIDES = 16
NECK_RADIUS = 0.105
TIP_RADIUS = 0.028

#: a long, gentle sine in Z: λ is twice the visible tail, so the tail leaves the
#: midpiece straight and then swings away in one smooth arc
WAVE_START = MIDPIECE_END
WAVE_LENGTH = 13.0
WAVE_AMPLITUDE = 0.62

#: mitochondrial sheath: pairs of beads on a helix of HELIX_TURNS turns.
#: 8 pairs over 3.5 turns steps 157.5° per pair, so the beads really do wrap the
#: axoneme; 7 pairs would step exactly 180° and collapse the "helix" into a flat
#: zigzag that disappears when the viewer orbits.
HELIX_TURNS = 3.5
HELIX_PAIRS = 8
HELIX_RADIUS = 0.125
BEAD_RADIUS = 0.105
BEAD_PAIR_OFFSET = 0.038

ACROSOME_COLOR = "#d9878f"
NUCLEUS_COLOR = "#755894"
MITOCHONDRIA_COLOR = "#ce7b4e"
FLAGELLUM_COLOR = "#6f9eaa"


def head_surface(semi, *, taper=HEAD_TAPER, segments=64, rings=36):
    """Ovoid whose long axis is X, slimmer towards −X (the front of the head).

    ``cellkit.uv_sphere`` puts its poles on ±Z; the cyclic axis swap below moves
    them onto ±X without flipping the winding, so the normals stay outward.
    """
    verts, faces = ck.uv_sphere(1.0, segments, rings)
    shaped = []
    for sx, sy, sz in verts:
        slim = 1.0 - taper * max(0.0, -sz)
        shaped.append((sz * semi[0], sx * semi[1] * slim, sy * semi[2] * slim))
    return shaped, faces


def tail_radius(fraction: float) -> float:
    """Axoneme radius: thickest at the neck, tapering to a point at the tip."""
    return TIP_RADIUS + (NECK_RADIUS - TIP_RADIUS) * (1.0 - fraction) ** 1.35


def tail_offset(x: float) -> float:
    """Gentle undulation in Z, faded in over the first stretch behind the sheath."""
    ramp = min(1.0, max(0.0, (x - WAVE_START) / 1.5))
    ramp = ramp * ramp * (3.0 - 2.0 * ramp)
    return -WAVE_AMPLITUDE * math.sin(TAU * (x - WAVE_START) / WAVE_LENGTH) * ramp


def build_acrosome():
    """Cap shell over the front of the head, opened flat at the back.

    ``cellkit.cut_plane`` cuts in the object's own coordinates, so the plane is
    given relative to the head centre even though the object is placed at it.
    """
    verts, faces = head_surface(ACROSOME)
    cap = ck.new_object(
        "acrosome_cap",
        verts,
        faces,
        ck.material("mat_acrosome", ACROSOME_COLOR, roughness=0.48),
        matrix=ck.transform(HEAD_CENTRE),
    )
    ck.cut_plane(cap, (ACROSOME_CUT, 0, 0), (1, 0, 0), keep="below")
    ck.solidify(cap, ACROSOME_SHELL)
    assert len(cap.data.polygons) > 0, "the acrosome cap was cut away completely"
    return ck.merge("acrosome", [cap], organelle="acrosome")


def build_nucleus():
    """The head volume itself: a solid, condensed nucleus."""
    verts, faces = head_surface(HEAD)
    nucleus = ck.new_object(
        "nucleus",
        verts,
        faces,
        ck.material("mat_nucleus", NUCLEUS_COLOR, roughness=0.44),
        matrix=ck.transform(HEAD_CENTRE),
    )
    return ck.merge("nucleus", [nucleus], organelle="nucleus")


def build_mitochondria(rng: ck.Rng):
    """Paired beads spiralling around the midpiece, as in the gallery render."""
    shells = []
    material = ck.material("mat_mitochondria", MITOCHONDRIA_COLOR, roughness=0.48)
    span = MIDPIECE_LENGTH - 0.12
    for index in range(HELIX_PAIRS):
        u = (index + 0.5) / HELIX_PAIRS
        x = MIDPIECE_START + 0.06 + span * u + rng.uniform(-0.012, 0.012)
        angle = TAU * HELIX_TURNS * u + rng.uniform(-0.12, 0.12)
        for side in (-1.0, 1.0):
            centre = Vector(
                (
                    x + side * BEAD_PAIR_OFFSET,
                    HELIX_RADIUS * math.cos(angle),
                    HELIX_RADIUS * math.sin(angle),
                )
            )
            size = BEAD_RADIUS * rng.uniform(0.90, 1.06)
            verts, faces = ck.uv_sphere(size, 20, 12)
            shells.append(
                ck.new_object(
                    f"mitochondrion_{index}_{0 if side < 0 else 1}",
                    [(vx * 1.12, vy, vz) for vx, vy, vz in verts],
                    faces,
                    material,
                    matrix=ck.transform(centre),
                )
            )
    return ck.merge("mitochondria", shells, organelle="mitochondria")


def build_flagellum():
    """Long tapering tail, straight out of the midpiece and then curving away."""
    length = TAIL_END - TAIL_START
    points, radii = [], []
    for index in range(TAIL_SAMPLES):
        fraction = index / (TAIL_SAMPLES - 1)
        x = TAIL_START + length * fraction
        points.append((x, 0.0, tail_offset(x)))
        radii.append(tail_radius(fraction))
    verts, faces = ck.tube(points, radii, sides=TAIL_SIDES)
    flagellum = ck.new_object(
        "flagellum",
        verts,
        faces,
        ck.material("mat_flagellum", FLAGELLUM_COLOR, roughness=0.40),
    )
    return ck.merge("flagellum", [flagellum], organelle="flagellum")


def main() -> None:
    ck.reset_scene()
    rng = ck.Rng(20261001)  # only the bead jitter is random; everything else is fixed

    objects = [
        build_acrosome(),
        build_nucleus(),
        build_mitochondria(rng),
        build_flagellum(),
    ]

    spans = []
    for axis in range(3):
        values = [vertex.co[axis] for obj in objects for vertex in obj.data.vertices]
        spans.append(max(values) - min(values))
    ck.report(
        "sperm-cell",
        objects=len(bpy.data.objects),
        verts=sum(len(obj.data.vertices) for obj in objects),
        faces=sum(len(obj.data.polygons) for obj in objects),
        size="x".join(f"{value:.2f}" for value in spans),
        beads=HELIX_PAIRS * 2,
        turns=HELIX_TURNS,
        structures=sorted(obj["organelle"] for obj in objects),
        seed=20261001,
    )
    ck.save_blend("sperm-cell.blend")
    path = ck.export_glb("public/sperm-cell.glb")
    print(f"[cellkit] EXPORTED sperm-cell -> {path} ({path.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
