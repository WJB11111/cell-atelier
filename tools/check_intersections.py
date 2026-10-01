"""Report geometry that actually interpenetrates, per specimen.

    blender --background --factory-startup --python tools/check_intersections.py -- animal-cell.blend

For every pair of structures it builds a BVH tree and asks Blender for the face
pairs that genuinely intersect, then reports the count and where the overlap
sits. Unlike looking at a render, this separates two very different situations:

* **intended** contact — a dendrite really does grow out of the soma, a
  ribosome really does sit on the ER surface, and the nucleus really does sit
  inside the cell. Those pairs are listed in ``EXPECTED`` per specimen.
* **accidental** interpenetration — two mitochondria merged into one another, a
  chloroplast crossing the vacuole wall, a granule buried inside the nucleus.
  Those are the ones worth fixing.

Self-overlap inside a single merged structure is reported too: several
mitochondria share one mesh, so a collision between two of them would otherwise
be invisible.

Options (after ``--``):

``--baseline PATH``         compare against a recorded state and exit non-zero on
                            any new contact or one that got deeper or bigger
``--update-baseline PATH``  record the current state instead of checking it
``--json PATH``             also write the raw report

The baseline is what turns this from a report into a release check: the counts
move whenever a model is rebuilt, and without a recording there is no way to tell
an improvement from a regression.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

#: pairs that are meant to touch, per specimen (order-independent)
EXPECTED = {
    "animal-cell": {
        ("nucleus", "nucleolus"),
        ("er", "ribosomes"),
        # the rough ER is continuous with the nuclear envelope: in a real cell
        # the sheets grow straight out of it, so they touch it by design
        ("er", "nucleus"),
    },
    "plant-cell": {
        ("nucleus", "nucleolus"),
        ("er", "ribosomes"),
    },
    "cyanobacterium": {
        ("thylakoids", "ribosomes"),
        ("nucleoid", "ribosomes"),
    },
    "white-blood-cell": {
        ("nucleus", "granules"),
    },
    "neuron": {
        ("nucleus", "nucleolus"),
        ("soma", "dendrites"),
        ("soma", "axon"),
        ("soma", "membrane"),
        ("soma", "nucleus"),
        ("axon", "myelin"),
        ("axon", "terminals"),
    },
    "red-blood-cell": set(),
    "sperm-cell": {
        ("nucleus", "acrosome"),
        ("nucleus", "flagellum"),
        ("mitochondria", "flagellum"),
    },
}


def deepest_penetration(first, second, samples: int = 400):
    """How far ``first`` reaches inside ``second``, and where.

    Face-pair counts overstate a grazing contact, which is why the report ranks
    by depth: a 0.02 intrusion is two surfaces touching, a 0.4 one is a
    structure genuinely buried in another. The returned point is the deepest
    vertex, which locates the copy at fault when a structure has several — the
    BVH's triangle indices do not map back to ``data.polygons``, so they cannot
    be used for this.
    """
    worst = 0.0
    worst_point = None
    for source, target in ((first, second), (second, first)):
        inverse = target.matrix_world.inverted()
        points = [source.matrix_world @ vertex.co for vertex in source.data.vertices]
        stride = max(1, len(points) // samples)
        for point in points[::stride]:
            hit, location, normal, _index = target.closest_point_on_mesh(inverse @ point)
            if not hit:
                continue
            world_location = target.matrix_world @ location
            world_normal = (target.matrix_world.to_3x3() @ normal).normalized()
            depth = (world_location - point).dot(world_normal)
            if depth > worst:
                worst = depth
                worst_point = point
    return worst, worst_point


def bvh_for(obj, depsgraph):
    return BVHTree.FromObject(obj, depsgraph)


def analyse(specimen: str, expected: set) -> dict:
    """Collect every self- and pair-overlap in the open file."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    trees = {}
    for obj in meshes:
        key = obj.get("organelle", obj.name)
        trees.setdefault(key, []).append((obj.name, bvh_for(obj, depsgraph), obj))

    report = {
        "specimen": specimen,
        "meshes": len(meshes),
        "structures": len(trees),
        "selfIntersections": {},
        "pairs": {},
    }

    # self-overlap: two copies of one structure merged into a single mesh
    for key, entries in sorted(trees.items()):
        for name, tree, _obj in entries:
            count = len(tree.overlap(tree))
            if count:
                report["selfIntersections"][key] = {"faces": count, "object": name}

    keys = sorted(trees)
    for i, first in enumerate(keys):
        for second in keys[i + 1:]:
            worst_pairs = 0
            worst_object = None
            for _name_a, tree_a, obj_a in trees[first]:
                for _name_b, tree_b, obj_b in trees[second]:
                    count = len(tree_a.overlap(tree_b))
                    if count > worst_pairs:
                        worst_pairs = count
                        worst_object = (obj_a, obj_b)
            if not worst_pairs:
                continue
            depth, where = deepest_penetration(*worst_object)
            is_expected = (first, second) in expected or (second, first) in expected
            report["pairs"][f"{first}|{second}"] = {
                "unintended": not is_expected,
                "faces": worst_pairs,
                "depth": round(depth, 3),
                "where": None if where is None else [round(value, 2) for value in where],
            }
    return report


def print_report(report: dict) -> None:
    print(f"=== {report['specimen']}: {report['meshes']} meshes, {report['structures']} structures ===")
    for key, entry in sorted(report["selfIntersections"].items()):
        print(f"  SELF-INTERSECT  {key:<14} {entry['faces']:6d} face pairs inside {entry['object']}")

    findings = sorted(
        report["pairs"].items(),
        key=lambda item: item[1]["depth"],
        reverse=True,
    )
    for key, entry in findings:
        first, second = key.split("|")
        # Face intersections are the fact; depth only grades severity. An
        # unexpected pair is never hidden: a body straddling a thin shell can
        # cross it with every vertex outside, which reads as depth 0. The contact
        # point locates the copy at fault when a structure has several.
        flag = "ok   " if not entry["unintended"] else ("MINOR" if entry["depth"] < 0.09 else "CHECK")
        spot = ""
        if entry["where"]:
            spot = f"  at ({entry['where'][0]:5.2f},{entry['where'][1]:5.2f},{entry['where'][2]:5.2f})"
        print(f"  {flag} {first:<14} x {second:<14} depth={entry['depth']:5.2f}  {entry['faces']:6d} face pairs{spot}")

    unintended = [item for item in report["pairs"].values() if item["unintended"]]
    print(f"  -- {len(report['pairs'])} intersecting pairs, {len(unintended)} of them unintended")


#: a pair may grow this much before it counts as a regression: rebuilt geometry
#: shifts contacts slightly, and a check that cries wolf gets ignored
DEPTH_TOLERANCE = 0.05
FACE_TOLERANCE = 50


def compare(report: dict, baseline: dict) -> tuple[list[str], list[str]]:
    """Return (regressions, improvements) of one report against a baseline."""
    regressions, improvements = [], []
    recorded = baseline.get(report["specimen"], {}).get("pairs", {})
    for key, entry in report["pairs"].items():
        if not entry["unintended"]:
            continue
        before = recorded.get(key)
        if before is None:
            regressions.append(f"new contact {key} ({entry['faces']} faces, depth {entry['depth']})")
            continue
        if entry["depth"] > before["depth"] + DEPTH_TOLERANCE:
            regressions.append(
                f"{key} penetrates deeper: {before['depth']} -> {entry['depth']}"
            )
        elif entry["faces"] > max(before["faces"] * 1.25, before["faces"] + FACE_TOLERANCE):
            regressions.append(f"{key} grew: {before['faces']} -> {entry['faces']} face pairs")

    for key, entry in recorded.items():
        if not entry["unintended"]:
            continue
        current = report["pairs"].get(key)
        if current is None:
            improvements.append(f"{key} no longer intersects")
        elif current["depth"] < entry["depth"] - DEPTH_TOLERANCE:
            improvements.append(f"{key} shallower: {entry['depth']} -> {current['depth']}")
    return regressions, improvements


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    options = {}
    positional = []
    index = 0
    while index < len(argv):
        token = argv[index]
        if token in {"--json", "--baseline", "--update-baseline"}:
            options[token] = argv[index + 1]
            index += 2
            continue
        positional.append(token)
        index += 1

    blend = positional[0] if positional else "animal-cell.blend"
    specimen = blend.replace(".blend", "")
    expected = EXPECTED.get(specimen, set())
    options.setdefault("--baseline", str(ROOT / "tools" / "intersection-baseline.json"))

    bpy.ops.wm.open_mainfile(filepath=str(ROOT / blend))
    # Bake every object transform into its mesh first: BVHTree.FromObject works
    # on local geometry, so an object that was moved after it was merged (the
    # Golgi, for one) would otherwise be compared at the wrong place. Copies of
    # a structure share mesh data, so split them before applying.
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.make_single_user(object=True, obdata=True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    report = analyse(specimen, expected)
    print_report(report)

    if "--json" in options:
        target = Path(options["--json"])
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")

    baseline_path = Path(options["--baseline"])
    baseline = {}
    if baseline_path.exists():
        baseline = json.loads(baseline_path.read_text(encoding="utf-8"))

    if "--update-baseline" in options:
        target = Path(options["--update-baseline"])
        baseline[specimen] = {
            "pairs": report["pairs"],
            "selfIntersections": report["selfIntersections"],
        }
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(dict(sorted(baseline.items())), ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
        print(f"  baseline updated: {target}")
        return

    regressions, improvements = compare(report, baseline)
    for note in improvements:
        print(f"  better: {note}")
    for note in regressions:
        print(f"  REGRESSION: {note}")
    if regressions:
        print(f"  -- {len(regressions)} regression(s) against {baseline_path.name}")
        sys.exit(1)
    print(f"  -- no regressions against {baseline_path.name}")


if __name__ == "__main__":
    main()
