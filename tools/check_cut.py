"""Numeric check of cellkit.cut_plane orientation (run headless).

    blender --background --factory-startup --python tools/check_cut.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cellkit as ck  # noqa: E402


def extent(obj):
    zs = [v.co.z for v in obj.data.vertices]
    return min(zs), max(zs)


ck.reset_scene()
for mode in ("below", "above"):
    obj = ck.new_object(f"probe_{mode}", *ck.uv_sphere(1.0, 32, 16))
    ck.cut_plane(obj, (0, 0, 0), (0, 0, 1), keep=mode)
    low, high = extent(obj)
    print(f"CUT keep={mode:5s} z-range=[{low:+.3f}, {high:+.3f}] -> "
          f"{'lower half' if high < 0.05 else 'upper half' if low > -0.05 else 'both halves'}")
