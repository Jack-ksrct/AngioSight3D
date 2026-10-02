"""Build a compact multi-material OBJ from the official BodyParts3D 4.0 archive."""
from __future__ import annotations

import argparse
import csv
import io
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "frontend" / "public" / "models"
HEART_AND_ROOTS = {"FMA7088", "FMA3736", "FMA3768", "FMA4720", "FMA8612"}
EXCLUDED_LONG_IVC_ELEMENTS = {"FJ3441", "FJ3659"}
CORONARY_VEIN_ELEMENTS = {
    "FJ2655", "FJ2656", "FJ2724", "FJ2727", "FJ2728", "FJ2729", "FJ2731",
}
CORONARY_TARGETS = {
    "LAD": {"FMA74912", "FMA3862", "FMA3860", "FMA3868", "FMA3872", "FMA3874", "FMA3876"},
    "LCX": {"FMA3855", "FMA3895"},
    "RCA": {"FMA3802", "FMA3807", "FMA3815", "FMA3818", "FMA3837", "FMA3840"},
}


def read_tsv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream, delimiter="\t"))


def remap_index(value: str, prior: int, local_count: int) -> str:
    index = int(value)
    return str(prior + index if index > 0 else prior + local_count + index + 1)


def combine_obj(archive: Path, element_parts: Path, output_dir: Path) -> None:
    rows = read_tsv(element_parts)
    files: dict[str, str] = {}
    vessel_parts: dict[str, set[str]] = {name: set() for name in CORONARY_TARGETS}
    for row in rows:
        fma = row["concept id"]
        element = row["element file id"]
        if fma in HEART_AND_ROOTS:
            files[element] = "heart_surface"
        for vessel, concepts in CORONARY_TARGETS.items():
            if fma in concepts:
                vessel_parts[vessel].add(element)
                files.setdefault(element, "heart_surface")
    for element in CORONARY_VEIN_ELEMENTS:
        if element in files:
            files[element] = "coronary_vein"
    # The source manifest lists element membership under the general heart
    # concept as well, so vessel materials must be applied after that pass.
    for vessel, elements in vessel_parts.items():
        for element in elements:
            files[element] = f"artery_{vessel}"

    if not files:
        raise ValueError("No BodyParts3D heart elements found in the supplied manifest")

    output_dir.mkdir(parents=True, exist_ok=True)
    obj_path = output_dir / "bodyparts3d-heart.obj"
    mtl_path = output_dir / "bodyparts3d-heart.mtl"
    vertex_total = uv_total = normal_total = 0
    with zipfile.ZipFile(archive) as bundle, obj_path.open("w", encoding="ascii", newline="\n") as out:
        out.write("mtllib bodyparts3d-heart.mtl\n")
        entries = set(bundle.namelist())
        for element, material in sorted(files.items()):
            entry = f"partof_BP3D_4.0_obj_99/{element}.obj"
            if entry not in entries:
                entry = next((name for name in entries if name.endswith(f"/{element}.obj")), None)
            if entry is None:
                raise FileNotFoundError(f"{element}.obj is missing from {archive}")
            raw = io.TextIOWrapper(bundle.open(entry), encoding="utf-8", errors="replace")
            lines = raw.readlines()
            local_v = sum(line.startswith("v ") for line in lines)
            local_vt = sum(line.startswith("vt ") for line in lines)
            local_vn = sum(line.startswith("vn ") for line in lines)
            out.write(f"o {element}\nusemtl {material}\n")
            for line in lines:
                if line.startswith(("v ", "vt ", "vn ")):
                    out.write(line)
                elif line.startswith("f "):
                    if element in EXCLUDED_LONG_IVC_ELEMENTS:
                        continue
                    tokens = []
                    for face_vertex in line.split()[1:]:
                        indexes = face_vertex.split("/")
                        indexes[0] = remap_index(indexes[0], vertex_total, local_v)
                        if len(indexes) > 1 and indexes[1]:
                            indexes[1] = remap_index(indexes[1], uv_total, local_vt)
                        if len(indexes) > 2 and indexes[2]:
                            indexes[2] = remap_index(indexes[2], normal_total, local_vn)
                        tokens.append("/".join(indexes))
                    out.write("f " + " ".join(tokens) + "\n")
            vertex_total += local_v
            uv_total += local_vt
            normal_total += local_vn

    mtl_path.write_text(
        "newmtl heart_surface\nKd 0.72 0.39 0.39\nKa 0.08 0.04 0.04\nKs 0.18 0.18 0.18\nNs 28\n\n"
        "newmtl artery_LAD\nKd 0.43 0.53 0.61\nKa 0.04 0.05 0.06\nKs 0.18 0.18 0.18\nNs 30\n\n"
        "newmtl artery_LCX\nKd 0.43 0.53 0.61\nKa 0.04 0.05 0.06\nKs 0.18 0.18 0.18\nNs 30\n\n"
        "newmtl artery_RCA\nKd 0.43 0.53 0.61\nKa 0.04 0.05 0.06\nKs 0.18 0.18 0.18\nNs 30\n\n"
        "newmtl coronary_vein\nKd 0.20 0.45 0.62\nKa 0.03 0.05 0.06\nKs 0.18 0.18 0.18\nNs 30\n",
        encoding="ascii",
    )
    print(f"Wrote {obj_path} ({obj_path.stat().st_size:,} bytes)")
    print(f"Combined {len(files)} BodyParts3D elements: " + ", ".join(f"{v}={len(ids)}" for v, ids in vessel_parts.items()))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True, help="Official partof_BP3D_4.0_obj_99.zip")
    parser.add_argument("--element-parts", type=Path, required=True, help="Official partof_element_parts.txt")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    combine_obj(args.archive, args.element_parts, args.output_dir)


if __name__ == "__main__":
    main()
