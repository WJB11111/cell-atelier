"""Build the closed plant cell envelope used by the "whole" view mode.

    blender --background --factory-startup --python build_plant_shells.py

Writes ``plant-shells.blend`` and ``public/plant-shells.glb``: a closed cell
wall and a closed plasma membrane that share the exact dimensions of the cutaway
model in ``build_plant_detailed.py``, so the viewer can cross-fade between the
two without the geometry jumping. Both objects carry ``wholeShell = True``.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

import cellkit as ck  # noqa: E402
from build_cell import (  # noqa: E402
    PLANT_MEMBRANE,
    PLANT_WALL,
    clear_material_cache,
    mat,
    plant_shell,
)


def main() -> None:
    ck.reset_scene()
    clear_material_cache()

    wall = plant_shell(PLANT_WALL, "wall", thickness=0.13, organelle="wall", seed=11,
                       cut=False, whole=True)
    membrane = plant_shell(PLANT_MEMBRANE, "plant_membrane", thickness=0.045,
                           organelle="membrane", seed=13, cut=False, whole=True,
                           displace_amount=0.03)

    ck.report(
        "plant-shells",
        objects=len(bpy.data.objects),
        verts=sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH"),
        shells=sorted(o["organelle"] for o in bpy.data.objects if o.type == "MESH"),
    )
    ck.save_blend("plant-shells.blend")
    path = ck.export_glb("public/plant-shells.glb")
    print(f"[cellkit] EXPORTED plant-shells -> {path} ({path.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
