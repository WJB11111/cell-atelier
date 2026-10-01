"""Build the mature human red blood cell specimen.

    blender --background --factory-startup --python build_red_blood_cell.py

Writes ``red-blood-cell.blend`` and ``public/red-blood-cell.glb``. Two selectable
structures are exported, each one a single mesh carrying its ``organelle`` key:

* ``membrane``      — the biconcave disc surface, colour ``#b8504f``;
* ``rbc_cytoplasm`` — the same disc at 98.5 %, colour ``#db8070``.

Both surfaces come from one profile, so the cytoplasm stays concentric with the
membrane the viewer fades away when the learner selects it.

The disc is a closed surface of revolution: the profile radius is exactly zero at
both ends, so ``cellkit.lathe`` collapses each end into a single pole vertex. That
is what keeps the dimpled faces solid — the centre of each face is a fan of
triangles around one vertex, never an open hole. Nothing in this specimen is cut
away, so the whole cell reads as one smooth biconcave body. It measures 5.6 units
across and 2.0 thick (2.8 : 1, the chunky silhouette of the gallery render).
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

import cellkit as ck  # noqa: E402

#: equatorial radius — 2.8 puts the disc 5.6 units across, inside the 4–7 range
RADIUS = 2.8
#: half of the rim thickness; 1.0 makes the disc 2.0 thick, i.e. 2.8 : 1 like the
#: gallery render (a chunky disc, not a thin lens)
HALF_THICKNESS = 1.0
#: the cytoplasm sits 1.5 % inside the membrane and is otherwise the same surface
CYTOPLASM_SCALE = 0.985
#: rings around the axis and samples from pole to pole
SEGMENTS = 128
PROFILE_STEPS = 176

MEMBRANE_COLOR = "#b8504f"
CYTOPLASM_COLOR = "#db8070"


def biconcave_profile():
    """Bottom→top ``(radius, height)`` profile of the biconcave disc.

    ``r = sin(a)`` and ``z = 0.32·cos(a)·(0.81 + 7.83r² − 4.39r⁴)`` is the usual
    illustrative erythrocyte curve: thick at the rim, dimpled on both faces. The
    height is normalised so the thickest ring is exactly ``HALF_THICKNESS``; the
    centre of each face then sits about a third of the way out from the mid-plane,
    the soft dent the gallery render shows.
    """
    raw = []
    for index in range(PROFILE_STEPS):
        angle = math.pi * index / (PROFILE_STEPS - 1)  # 0 = top pole, pi = bottom pole
        radius = math.sin(angle)
        height = 0.32 * math.cos(angle) * (0.81 + 7.83 * radius**2 - 4.39 * radius**4)
        raw.append((radius, height))
    rim = max(abs(height) for _radius, height in raw)  # ~0.821, reached at r ~ 0.70
    profile = [(radius * RADIUS, height / rim * HALF_THICKNESS) for radius, height in raw]
    profile.reverse()  # lathe sweeps bottom → top
    return profile, rim


def measure(objects):
    """Bounding box of the built specimen, for the build log."""
    spans = []
    for axis in range(3):
        values = [vertex.co[axis] for obj in objects for vertex in obj.data.vertices]
        spans.append(max(values) - min(values))
    return spans


def main() -> None:
    ck.reset_scene()
    profile, rim = biconcave_profile()
    verts, faces = ck.lathe(profile, SEGMENTS)

    membrane = ck.new_object(
        "membrane",
        verts,
        faces,
        ck.material("mat_membrane", MEMBRANE_COLOR, roughness=0.50),
    )
    objects = [ck.merge("membrane", [membrane], organelle="membrane")]

    # Identical geometry, uniformly shrunk: the cytoplasm never pokes through the
    # membrane and stays put when the viewer hides it.
    cytoplasm = ck.new_object(
        "rbc_cytoplasm",
        verts,
        faces,
        ck.material("mat_rbc_cytoplasm", CYTOPLASM_COLOR, roughness=0.52),
        matrix=ck.transform(scale=CYTOPLASM_SCALE),
    )
    objects.append(ck.merge("rbc_cytoplasm", [cytoplasm], organelle="rbc_cytoplasm"))

    spans = measure(objects)
    ck.report(
        "red-blood-cell",
        objects=len(bpy.data.objects),
        verts=sum(len(obj.data.vertices) for obj in objects),
        faces=sum(len(obj.data.polygons) for obj in objects),
        size="x".join(f"{value:.2f}" for value in spans),
        diameter_to_thickness=f"{spans[0] / spans[2]:.2f}",
        profile_rim=f"{rim:.4f}",
        structures=sorted(obj["organelle"] for obj in objects),
    )
    ck.save_blend("red-blood-cell.blend")
    path = ck.export_glb("public/red-blood-cell.glb")
    print(f"[cellkit] EXPORTED red-blood-cell -> {path} ({path.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
