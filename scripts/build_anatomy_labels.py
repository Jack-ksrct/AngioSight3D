"""Regenerate frontend/src/anatomyLabels.js from the official BodyParts3D archive.

The shipped .obj carries no anatomical names, so the viewer needs a region id to
name table. Every name this writes is an official BodyParts3D English concept
name; nothing is inferred from geometry or written by hand.

For each region in the .obj the name is the deepest concept that contains it in
the IS-A class hierarchy, taken from the release archive:

    https://dbarchive.biosciencedb.jp/data/bodyparts3d/LATEST/

  isa_element_parts.txt             concept id / name / element file id
  isa_inclusion_relation_list.txt   parent id / parent name / child id / child name

The tables are cached under scripts/.bp3d-cache/ and only re-downloaded when
missing. Usage:

    python scripts/build_anatomy_labels.py
"""
from __future__ import annotations

import argparse
import csv
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(__file__).resolve().parent / ".bp3d-cache"
BASE_URL = "https://dbarchive.biosciencedb.jp/data/bodyparts3d/LATEST"
DEFAULT_OBJ = ROOT / "frontend" / "public" / "models" / "bodyparts3d-heart.obj"
DEFAULT_OUTPUT = ROOT / "frontend" / "src" / "anatomyLabels.js"
TABLES = ("isa_element_parts.txt", "isa_inclusion_relation_list.txt")

# Upper-ontology terms from the FMA that describe every anatomical entity rather
# than a structure. Dropped before the deepest-concept search.
UPPER_ONTOLOGY = {
    "anatomical entity", "physical anatomical entity", "anatomical structure",
    "material anatomical entity", "immaterial anatomical entity", "anatomical space",
    "anatomical cavity", "organ", "organ component", "cardinal organ part",
    "organ region", "organ segment", "region of organ component", "body",
    "body region", "body cavity", "body cavity content", "anatomical conduit",
}

# Ordered (group, predicate) rules over the official wording. First match wins.
# "coronary" comes first because those regions carry an artery_* material and are
# therefore coloured by the model estimate rather than a fixed group colour.
GROUP_RULES = (
    ("coronary", lambda name: name.endswith("artery")),
    ("vein", lambda name: name.endswith("vein") or "coronary sinus" in name or "vena cava" in name),
    ("artery", lambda name: name in {"ascending aorta", "arch of aorta", "pulmonary trunk"}),
    ("valve", lambda name: "valve" in name),
    ("cavity", lambda name: name.startswith("cavity of")),
    ("myocardium", lambda name: "papillary muscle" in name or name.startswith("wall of")),
)

# Written out verbatim so the generated module is byte-identical on every run.
MODULE_HEADER = """// BodyParts3D 4.0 region labels for the heart assembly shipped in
// public/models/bodyparts3d-heart.obj.
//
// The .obj carries no names, so these come from the official release archive:
// for each region, the deepest concept that contains it in the IS-A class
// hierarchy (isa_element_parts.txt + isa_inclusion_relation_list.txt).
// scripts/build_bodyparts3d_heart.py selects the same regions by FMA concept
// id, so the names below and the .mtl material groups agree region for region.
// Regenerate with: python scripts/build_anatomy_labels.py

// BodyParts3D region id -> [official English name, anatomy group].
export const PART_LABELS = {
"""

MODULE_FOOTER = """};

// Anatomy groups, in legend order. The coronary group's colour is driven by the
// model estimate, so it is deliberately absent here. Each colour is a clear
// step away from the others: the cavities sit two shades below the myocardium,
// the valves are the lightest surface, and the great arteries are a lighter blue
// than the veins so the two vessel families stay distinguishable.
export const PART_GROUP_LABELS = {
  myocardium: 'Myocardium',
  cavity: 'Chamber cavity',
  valve: 'Valve',
  artery: 'Great artery',
  vein: 'Vein',
  coronary: 'Coronary artery',
};

export const PART_GROUP_COLORS = {
  myocardium: '#bd7774',
  cavity: '#5a2b33',
  valve: '#e8d9ae',
  artery: '#a8cbe2',
  vein: '#4e91b8',
};

export const NAMED_REGION_COUNT = Object.keys(PART_LABELS).length;
export const DISTINCT_REGION_NAMES = new Set(Object.values(PART_LABELS).map(([name]) => name)).size;
"""


def download_tables() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    missing = [table for table in TABLES if not (CACHE / table).exists() or not (CACHE / table).stat().st_size]
    if not missing:
        return
    failures = []
    for table in missing:
        target = CACHE / table
        url = f"{BASE_URL}/{table}"
        print(f"downloading {url}")
        try:
            with urllib.request.urlopen(url, timeout=300) as response:
                target.write_bytes(response.read())
        except OSError as error:                  # includes URLError / socket errors
            failures.append(f"  {table}: {error}")
            target.unlink(missing_ok=True)
            continue
        print(f"  {table} -> {target.stat().st_size} bytes")
    if failures:
        raise SystemExit(
            "Could not download the BodyParts3D tables:\n"
            + "\n".join(failures)
            + f"\n\nFetch them from {BASE_URL}/ and place them in {CACHE} as:\n"
            + "\n".join(f"  {CACHE / table}" for table in missing)
        )


def read_rows(table: str) -> list[dict[str, str]]:
    with (CACHE / table).open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream, delimiter="\t"))


def build_depths() -> dict[str, int]:
    """Longest path from a root concept down to each node of the IS-A tree."""
    parents: dict[str, set[str]] = defaultdict(set)
    for row in read_rows("isa_inclusion_relation_list.txt"):
        parent, child = row["parent id"].strip(), row["child id"].strip()
        if parent and child and parent != child:
            parents[child].add(parent)

    depth: dict[str, int] = {}

    def walk(concept: str, guard: frozenset[str]) -> int:
        if concept in depth:
            return depth[concept]
        if concept in guard:                       # malformed cycle in the table
            return 0
        guard = guard | {concept}
        ancestors = parents.get(concept)
        depth[concept] = 0 if not ancestors else 1 + max(walk(p, guard) for p in ancestors)
        return depth[concept]

    for concept in list(parents):
        walk(concept, frozenset())
    return depth


def resolve_names() -> dict[str, dict[str, str]]:
    depth = build_depths()
    concepts: dict[str, dict[str, str]] = defaultdict(dict)
    for row in read_rows("isa_element_parts.txt"):
        concept, name, element = row["concept id"].strip(), row["name"].strip(), row["element file id"].strip()
        if concept and name and element:
            concepts[element][concept] = name

    def resolve(element: str) -> str:
        candidates = {c: n for c, n in concepts[element].items() if n.lower() not in UPPER_ONTOLOGY}
        if not candidates:
            raise SystemExit(f"{element}: only upper-ontology concepts in the archive tables")
        deepest = max(depth.get(c, 0) for c in candidates)
        winners = sorted({n for c, n in candidates.items() if depth.get(c, 0) == deepest})
        # Every element in this asset resolves to a single deepest concept; the
        # longest-name tiebreak exists only so a future re-export cannot crash.
        return max(winners, key=lambda name: (len(name), name))

    return {element: resolve(element) for element in concepts}


def obj_regions(obj_path: Path) -> list[str]:
    regions: list[str] = []
    pattern = re.compile(r"^o (\S+)$")
    with obj_path.open(encoding="ascii") as stream:
        for line in stream:
            match = pattern.match(line)
            if match and match.group(1) not in regions:
                regions.append(match.group(1))
    return regions


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--obj", type=Path, default=DEFAULT_OBJ)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    download_tables()
    names = resolve_names()
    regions = obj_regions(args.obj)
    missing = [region for region in regions if region not in names]
    if missing:
        raise SystemExit(f"{len(missing)} regions in the .obj are absent from the archive: {missing}")

    rows = []
    unclassified = []
    for region in regions:
        name = names[region]
        if "'" in name or "\\" in name:
            raise SystemExit(f"unsafe characters in {region}: {name}")
        group = next((name_ for name_, test in GROUP_RULES if test(name)), None)
        if group is None:
            unclassified.append(region)
            group = "myocardium"
        rows.append(f"  {region}: ['{name}', '{group}'],")

    if unclassified:
        print(f"warning: {len(unclassified)} regions fell back to the myocardium group: {unclassified}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(MODULE_HEADER + "\n".join(rows) + "\n" + MODULE_FOOTER, encoding="utf-8")
    print(f"wrote {args.output} ({args.output.stat().st_size} bytes, {len(rows)} regions)")


if __name__ == "__main__":
    main()