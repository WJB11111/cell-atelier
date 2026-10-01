"""Render the README gallery from the exported models.

    blender --background --factory-startup --python render_gallery.py

Pass specimen ids after ``--`` to rebuild only those. Writes
``docs/images/gallery/<id>.png`` using the same studio lighting as the
thumbnails but at full size and with a soft floor.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "tools"))

import bpy  # noqa: E402

import studio  # noqa: E402

ROOT = Path(__file__).resolve().parent

GALLERY = {
    "animal-cell": ("animal-cell.blend", (0.30, -0.62, 0.72), 1024),
    "plant-cell": ("plant-cell.blend", (0.34, -0.58, 0.74), 1024),
    "plant-shells": ("plant-shells.blend", (0.42, -0.72, 0.45), 800),
    "cyanobacterium": ("cyanobacterium.blend", (0.24, -0.55, 0.80), 1024),
    "white-blood-cell": ("white-blood-cell.blend", (0.30, -0.60, 0.74), 1024),
    "neuron": ("neuron.blend", (0.20, -0.66, 0.72), 1024),
    "red-blood-cell": ("red-blood-cell.blend", (0.26, -0.52, 0.82), 1024),
    "sperm-cell": ("sperm-cell.blend", (0.28, -0.66, 0.70), 1024),
}


def main() -> None:
    requested = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    targets = requested or list(GALLERY)
    for name in targets:
        blend, direction, size = GALLERY[name]
        bpy.ops.wm.open_mainfile(filepath=str(ROOT / blend))
        scene = bpy.context.scene
        studio.configure(scene, size=size, samples=64, transparent=True, floor=False)
        studio.aim_camera(scene, direction, margin=1.06, lens=55)
        studio.render(scene, ROOT / "docs" / "images" / "gallery" / f"{name}.png", label=name)


if __name__ == "__main__":
    main()
