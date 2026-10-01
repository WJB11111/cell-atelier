"""Render the small catalogue thumbnails shown next to each specimen name.

    blender --background --factory-startup --python render_thumbnails.py

Pass specimen ids after ``--`` to rebuild only those, e.g.
``-- python render_thumbnails.py -- plant-cell``. Writes
``public/thumbnails/<id>.png`` with a transparent background.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "tools"))

import bpy  # noqa: E402

import studio  # noqa: E402

ROOT = Path(__file__).resolve().parent

#: specimen id -> (blend file, camera direction)
SPECIMENS = {
    "animal-cell": ("animal-cell.blend", (0.34, -0.62, 0.70)),
    "plant-cell": ("plant-cell.blend", (0.36, -0.58, 0.72)),
    "cyanobacterium": ("cyanobacterium.blend", (0.24, -0.55, 0.80)),
    "white-blood-cell": ("white-blood-cell.blend", (0.30, -0.60, 0.74)),
    "neuron": ("neuron.blend", (0.22, -0.62, 0.75)),
    "red-blood-cell": ("red-blood-cell.blend", (0.26, -0.52, 0.82)),
    "sperm-cell": ("sperm-cell.blend", (0.30, -0.64, 0.71)),
}


def main() -> None:
    requested = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    targets = requested or list(SPECIMENS)
    for name in targets:
        blend, direction = SPECIMENS[name]
        bpy.ops.wm.open_mainfile(filepath=str(ROOT / blend))
        scene = bpy.context.scene
        studio.configure(scene, size=240, samples=48, transparent=True, floor=False)
        studio.aim_camera(scene, direction, margin=1.12, lens=58)
        studio.render(scene, ROOT / "public" / "thumbnails" / f"{name}.png", label=name)


if __name__ == "__main__":
    main()
