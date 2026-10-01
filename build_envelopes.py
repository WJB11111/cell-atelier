"""Build the closed envelopes used by the "whole" and "transparent" view modes.

    blender --background --factory-startup --python build_envelopes.py

Every specimen whose outer layer is sectioned in the teaching model also ships a
closed version of that same layer, so the viewer can cross-fade between "cut
open" and "intact" without the surface jumping: each envelope here reuses the
*same* dimensions, displacement seeds and material palette as its sectioned
counterpart in ``build_<specimen>.py``. Objects are marked ``wholeShell`` so the
viewer knows they belong to the whole-view mode.

Pass specimen ids after ``--`` to rebuild only those, e.g.
``-- python build_envelopes.py -- neuron``. The plant cell's envelope lives in
``build_plant_shells.py`` and is not rebuilt here.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

import cellkit as ck  # noqa: E402
from build_cell import clear_material_cache  # noqa: E402


def build(specimen: str) -> list:
    """Rebuild one specimen's closed envelope; returns the shell objects."""
    ck.reset_scene()
    clear_material_cache()

    if specimen == "animal-cell":
        import build_animal_detailed as module
        return [module.build_membrane(ck.Rng(20260930), section=False)]

    if specimen == "cyanobacterium":
        import build_cyanobacterium as module
        return module.build_envelope(ck.Rng(20261002), section=False)

    if specimen == "white-blood-cell":
        import build_white_blood_cell as module
        # the same seed, and the membrane is still the first consumer of it, so
        # the surface processes land exactly where the sectioned model has them
        return [module.build_membrane(ck.Rng(20261003), section=False)]

    if specimen == "neuron":
        import build_neuron as module
        return [module.build_membrane(ck.Rng(20261004), section=False)]

    raise SystemExit(f"unknown specimen: {specimen}")


def main() -> None:
    requested = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    targets = requested or ["animal-cell", "cyanobacterium", "white-blood-cell", "neuron"]
    for specimen in targets:
        shells = build(specimen)
        ck.report("envelope", specimen=specimen,
                  layers=sorted(obj["organelle"] for obj in shells),
                  verts=sum(len(obj.data.vertices) for obj in shells))
        path = ck.export_glb(f"public/{specimen}-shells.glb")
        print(f"[cellkit] EXPORTED {specimen}-shells -> {path} ({path.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
