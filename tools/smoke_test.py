"""Exercise every cellkit primitive and export a probe asset.

    blender --background --factory-startup --python tools/smoke_test.py -- \
        --python tools/render_preview.py -- probe.png 0 5 12

A green log means the toolkit, the material helper and the glTF exporter all
work in this Blender build.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import cellkit as ck  # noqa: E402

ck.reset_scene()
probe = []

# sphere + superellipsoid + lathe
probe.append(ck.build("sphere", *ck.uv_sphere(0.9, 40, 20), ck.material("ProbeSphere", "#9865a9"),
                      matrix=ck.transform((-3.2, 0, 0))))
probe.append(ck.build("superellipsoid", *ck.superellipsoid((1.8, 1.6, 1.4), 0.35, 48, 24),
                      ck.material("ProbeBox", "#748e49"), matrix=ck.transform((0, 0, 0))))
profile = [(0.0, -1.0), (0.8, -0.85), (1.0, -0.2), (0.95, 0.3), (0.0, 0.95)]
probe.append(ck.build("lathe", *ck.lathe(profile, 48), ck.material("ProbeLathe", "#cc6c52"),
                      matrix=ck.transform((3.2, 0, 0))))

# curved tube, ribbon and disc
curve = [(-2.6 + 0.35 * i, 2.6 + math.sin(i * 0.6) * 0.7, -0.6 + i * 0.14) for i in range(16)]
probe.append(ck.build("tube", *ck.tube(curve, 0.16, 14), ck.material("ProbeTube", "#c87e96")))
ribbon_points = [(0.4 + 0.3 * i, 2.4, 0.2 + math.sin(i * 0.5) * 0.5) for i in range(12)]
probe.append(ck.build("ribbon", *ck.ribbon(ribbon_points, 0.7, 0.035), ck.material("ProbeRibbon", "#8b69a6")))
probe.append(ck.build("disc", *ck.disc(0.8, 0.1, 40, 0.06), ck.material("ProbeDisc", "#d4b15d"),
                      matrix=ck.transform((3.0, 2.4, 0.0))))
probe.append(ck.build("ring", *ck.ring_tube(0.7, 0.09, 40, 10), ck.material("ProbeRing", "#80abba"),
                      matrix=ck.transform((-3.0, 2.4, 0.0))))

# cutaway + solidify + noise displacement
shell = ck.build("cutaway", *ck.uv_sphere(1.3, 48, 24), ck.material("ProbeShell", "#9986ba"))
ck.cut_plane(shell, (0, 0, 0.45), (0, 0, 1), keep="below")
ck.solidify(shell, 0.07)
ck.displace(shell, 0.045, 1.6, seed=11)
probe.append(shell)

# merge + scatter
dot = ck.build("dot", *ck.uv_sphere(0.09, 12, 8), ck.material("ProbeDot", "#b49ac5"))
rng = ck.Rng(5)
dots = ck.scatter(dot, [ck.transform(rng.point_in_ball(2.2), rng.rotation()) for _ in range(40)], organelle="dots")
probe.extend(dots)
merged = ck.merge("dots", dots, organelle="dots")

# export + asset checks
path = ck.export_glb("public/_probe.glb")
size = path.stat().st_size
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
ck.report("smoke", objects=len(bpy.data.objects), meshes=len(meshes), merged_verts=len(merged.data.vertices),
          glb_bytes=size, uvs=bool(merged.data.uv_layers))
assert size > 1000, "glb export produced a suspiciously small file"
assert merged.data.uv_layers, "merged mesh lost its UV layer"
assert bpy.data.objects.get("dots")["organelle"] == "dots"
print("[cellkit] smoke OK")
