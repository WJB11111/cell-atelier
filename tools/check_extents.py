"""Report how far each structure reaches from the origin, per specimen.

    blender --background --factory-startup --python tools/check_extents.py -- animal-cell

Used to catch a structure that pokes through its own envelope: in "whole" mode
the closed envelope is opaque, so anything sticking out is visible from outside.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
blend = argv[0] if argv else "animal-cell.blend"
bpy.ops.wm.open_mainfile(filepath=str(Path(__file__).resolve().parent.parent / blend))

rows = []
for obj in bpy.context.scene.objects:
    if obj.type != "MESH":
        continue
    matrix = obj.matrix_world
    farthest = 0.0
    nearest = float("inf")
    for vertex in obj.data.vertices:
        distance = (matrix @ vertex.co).length
        farthest = max(farthest, distance)
        nearest = min(nearest, distance)
    rows.append((obj.get("organelle", obj.name), len(obj.data.vertices), nearest, farthest))

rows.sort(key=lambda row: -row[3])
print(f"=== {blend}: radial extent from the origin (blend units) ===")
for organelle, verts, nearest, farthest in rows:
    print(f"{organelle:14s} verts={verts:6d} nearest={nearest:6.2f} farthest={farthest:6.2f}")

envelope = [row for row in rows if row[0] in {"membrane", "wall", "cytoplasm"}]
if envelope:
    inner = min(row[2] for row in envelope)
    print(f"--- innermost envelope surface at {inner:.2f}; structures beyond it would poke out ---")
    for organelle, _verts, _nearest, farthest in rows:
        if organelle not in {"membrane", "wall", "cytoplasm"} and farthest > inner:
            print(f"    POKES OUT: {organelle} reaches {farthest:.2f}")
