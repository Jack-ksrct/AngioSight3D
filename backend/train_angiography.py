"""Train the CADICA angiography branch: a patch-level lesion detector.

Dataset context
---------------
CADICA ships 42 patients with selected-frames lists. Every selected frame from
a *lesion* video carries ground-truth lesion boxes; frames from *non-lesion*
videos carry none, and the two sets line up exactly (6,126 frames: 3,996
positive, 2,130 negative). A frame is therefore labelled by its video type.

Method
------
1. Positive training patches are the annotated lesion boxes themselves (cropped
   and resized to 96 x 96). Negative training patches are random 96 x 96 crops
   from non-lesion frames.
2. Features are HOG descriptors (9 orientations, 8 px cells, 2 x 2 blocks).
3. Honest evaluation uses patient-grouped cross-validation (StratifiedGroupKFold
   so frames of the same patient never straddle train/test). A frame is scored
   by sliding a 96 px window over the full-resolution frame and taking the
   hottest window probability.
4. The served model is fitted once on every patch of every patient.

Outputs
-------
models/angiography.joblib        scaler + classifier + config + classes
models/angiography_metrics.json  CV metrics (frame- and patient-level) + fusion config

Frame-level discrimination is modest under patient-grouped CV (a small cohort,
and local lesion cues only weakly separate whole frames), which is reflected in
the metrics file and surfaced honestly in the UI.
"""
import argparse
import collections
import io
import json
import platform
import re
import time
from pathlib import Path

import joblib
import numpy as np
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.preprocessing import StandardScaler

CONFIG = {
    "patch": 96,
    "stride": 48,
    "max_side": 1024,
    "orientations": 9,
    "pixels_per_cell": 8,
    "cells_per_block": 2,
}


def read_list(archive, names, name):
    if name not in names:
        return []
    with archive.open(name) as handle:
        return [token for token in handle.read().decode("utf-8", "replace").split() if token.strip()]


def norm_tokens(tokens):
    numbers = set()
    for token in tokens:
        match = re.search(r"(\d+)", token)
        if match:
            numbers.add(int(match.group(1)))
    return numbers


def parse_boxes(archive, names, ground_truth):
    boxes = []
    if ground_truth in names:
        with archive.open(ground_truth) as handle:
            for line in handle.read().decode("utf-8", "replace").splitlines():
                parts = line.split()
                if len(parts) >= 4:
                    try:
                        x, y, width, height = (int(float(value)) for value in parts[:4])
                    except ValueError:
                        continue
                    boxes.append((x, y, width, height))
    return boxes


def vessel_labels(archive, patient_ids):
    """Map patient id -> bool('Number of vessels affected' > 0)."""
    import openpyxl

    label = {}
    with archive.open("CADICA/metadata.xlsx") as handle:
        workbook = openpyxl.load_workbook(io.BytesIO(handle.read()), data_only=True)
    rows = list(workbook["METADATA"].iter_rows(values_only=True))
    header = list(rows[0])
    index = {k: i for i, k in enumerate(header) if k is not None}
    for row in rows[1:]:
        if row[0] is None:
            continue
        pid = int(row[index["Patient ID"]])
        vessels = row[index["Number of vessels affected"]]
        label[pid] = bool(vessels is not None and float(vessels) > 0)
    return {pid: label.get(pid, False) for pid in patient_ids}


def collect_frames_and_patches(zip_path):
    archive = zipfile_handle(zip_path)
    names = set(archive.namelist())
    patient_ids = sorted(
        {int(match.group(1)) for name in names for match in [re.search(r"selectedVideos/p(\d+)/", name)] if match}
    )
    frames, patches = {}, []
    for pid in patient_ids:
        base = f"CADICA/selectedVideos/p{pid}"
        lesion = norm_tokens(read_list(archive, names, f"{base}/lesionVideos.txt"))
        nonlesion = norm_tokens(read_list(archive, names, f"{base}/nonlesionVideos.txt"))
        for number in sorted(lesion | nonlesion):
            vid = f"v{number}"
            video_base = f"{base}/{vid}"
            selected = read_list(archive, names, f"{video_base}/p{pid}_{vid}_selectedFrames.txt")
            label = 1 if number in lesion else 0
            for frame_id in selected:
                rel = frame_id if frame_id.startswith(f"p{pid}_") else f"{pid}_{vid}_{frame_id}"
                png = f"{video_base}/input/{rel}.png"
                if png not in names:
                    continue
                frames[(pid, png, label)] = None
                if label:
                    for box in parse_boxes(archive, names, f"{video_base}/groundtruth/{rel}.txt"):
                        patches.append((pid, png, box))
    archive.close()
    return list(frames.keys()), patches


def zipfile_handle(zip_path):
    import zipfile

    return zipfile.ZipFile(zip_path)


def frame_to_gray(archive, png):
    import zipfile

    with archive.open(png) as handle:
        image = Image.open(io.BytesIO(handle.read()))
        image.load()
    return np.asarray(image.convert("L"), dtype=np.float32) / 255.0


def hog1(cell):
    from skimage.feature import hog

    return hog(
        cell,
        orientations=CONFIG["orientations"],
        pixels_per_cell=(CONFIG["pixels_per_cell"], CONFIG["pixels_per_cell"]),
        cells_per_block=(CONFIG["cells_per_block"], CONFIG["cells_per_block"]),
        block_norm="L2-Hys",
        transform_sqrt=True,
        feature_vector=True,
    )


def box_patch_hog(archive, png, box):
    x, y, width, height = box
    with archive.open(png) as handle:
        image = Image.open(io.BytesIO(handle.read()))
        image.load()
    crop = image.crop((x, y, x + max(1, width), y + max(1, height)))
    cell = np.asarray(crop.convert("L").resize((CONFIG["patch"], CONFIG["patch"]), Image.LANCZOS), dtype=np.float32) / 255.0
    return hog1(cell)


def window_hogs(arr, patch, stride):
    height, width = arr.shape
    xs = list(range(0, width - patch + 1, stride)) or [max(0, width - patch)]
    ys = list(range(0, height - patch + 1, stride)) or [max(0, height - patch)]
    return np.asarray([hog1(arr[y : y + patch, x : x + patch]) for y in ys for x in xs], dtype=np.float32)


def build_negative_patches(archive, frames, rng):
    negative = [frame for frame in frames if frame[2] == 0]
    features, groups = [], []
    for pid, png, _ in negative:
        with archive.open(png) as handle:
            image = Image.open(io.BytesIO(handle.read()))
            image.load()
        width, height = image.size
        side = CONFIG["patch"]
        x = rng.randint(0, max(1, width - side))
        y = rng.randint(0, max(1, height - side))
        crop = image.crop((x, y, x + side, y + side))
        cell = np.asarray(crop.convert("L").resize((side, side), Image.LANCZOS), dtype=np.float32) / 255.0
        features.append(hog1(cell))
        groups.append(pid)
    return np.asarray(features, dtype=np.float32), np.asarray(groups, dtype=np.int32)


def score_frame(archive, clf, scaler, png):
    window = window_hogs(frame_to_gray(archive, png), CONFIG["patch"], CONFIG["stride"])
    return float(np.max(clf.predict_proba(scaler.transform(window))[:, 1]))


def run_cv(archive, frames, patches, negative_features, negative_groups, vessel_label, folds, seed):
    positive_features = np.asarray([box_patch_hog(archive, png, box) for _, png, box in patches], dtype=np.float32)
    positive_groups = np.asarray([pid for pid, _, _ in patches], dtype=np.int32)
    X = np.concatenate([positive_features, negative_features])
    y = np.concatenate([np.ones(len(positive_features), dtype=np.int32), np.zeros(len(negative_features), dtype=np.int32)])
    groups = np.concatenate([positive_groups, negative_groups])

    splitter = StratifiedGroupKFold(n_splits=folds, shuffle=True, random_state=seed)
    frame_scores = {}
    for fold, (train_index, test_index) in enumerate(splitter.split(X, y, groups)):
        scaler = StandardScaler(with_mean=False).fit(X[train_index])
        clf = LogisticRegression(max_iter=4000, class_weight="balanced", C=1.0, random_state=seed)
        clf.fit(scaler.transform(X[train_index]), y[train_index])
        test_patients = {int(g) for g in set(groups[test_index])}
        test_frames = [frame for frame in frames if frame[0] in test_patients]
        for pid, png, label in test_frames:
            frame_scores[png] = (score_frame(archive, clf, scaler, png), label, pid)
        print(f"  fold {fold + 1}/{folds}: patients={len(test_patients)} frames={len(test_frames)}")
    return frame_scores, X, y, groups, (scaler, clf)


def patient_metrics(frame_scores, vessel_label):
    by_patient = collections.defaultdict(list)
    for _, (score, _, pid) in frame_scores.items():
        by_patient[pid].append(score)
    patients = sorted(by_patient)
    for_auc = np.array([np.max(by_patient[pid]) for pid in patients])
    truth = np.array([int(vessel_label.get(pid, 0)) for pid in patients])
    report = {"n": len(patients)}
    for name, values in (("max", for_auc),):
        report[name] = {
            "roc_auc": float(roc_auc_score(truth, values)),
            "accuracy_0.5": float(accuracy_score(truth, (values >= 0.5).astype(int))),
        }
    report["confusion_0.5"] = confusion_matrix(truth, (for_auc >= 0.5).astype(int), labels=[0, 1]).tolist()
    return report, truth, for_auc


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", required=True, help="Path to the CADICA zip archive.")
    parser.add_argument("--output", default="models")
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    zip_path = Path(args.zip)
    out = Path(args.output)
    started = time.time()

    archive = zipfile_handle(zip_path)
    frames, patches = collect_frames_and_patches(zip_path)
    patient_ids = sorted({frame[0] for frame in frames})
    vessel_label = vessel_labels(archive, patient_ids)
    archive.close()
    print(f"frames={len(frames)} patches={len(patches)} patients={len(patient_ids)} "
          f"positive={sum(1 for f in frames if f[2]==1)} negative={sum(1 for f in frames if f[2]==0)}")

    rng = np.random.RandomState(args.seed)
    archive = zipfile_handle(zip_path)
    negative_features, negative_groups = build_negative_patches(archive, frames, rng)
    frame_scores, X, y, groups, _ = run_cv(archive, frames, patches, negative_features, negative_groups, vessel_label, args.folds, args.seed)
    archive.close()

    frame_items = sorted(frame_scores.items())
    # frame_scores maps png -> (score, label, patient). items() yields (png, tuple).
    truth = np.array([item[1][1] for item in frame_items])
    scores = np.array([item[1][0] for item in frame_items])
    frame_report = {
        "n": len(frame_items),
        "roc_auc": float(roc_auc_score(truth, scores)),
        "accuracy": float(accuracy_score(truth, (scores >= 0.5).astype(int))),
        "balanced_accuracy": float(balanced_accuracy_score(truth, (scores >= 0.5).astype(int))),
        "f1": float(f1_score(truth, (scores >= 0.5).astype(int), zero_division=0)),
        "confusion_matrix": confusion_matrix(truth, (scores >= 0.5).astype(int), labels=[0, 1]).tolist(),
        "class_counts": {"non_lesion": int((truth == 0).sum()), "lesion": int((truth == 1).sum())},
    }
    patient_report, _, _ = patient_metrics(frame_scores, vessel_label)
    print(f"\nFrame-level: n={frame_report['n']} auc={frame_report['roc_auc']:.4f} "
          f"acc={frame_report['accuracy']:.4f} bal={frame_report['balanced_accuracy']:.4f}")
    print(f"Patient-level (vessels affected > 0): n={patient_report['n']} "
          f"max auc={patient_report['max']['roc_auc']:.4f}")

    # Fit the served model on every labelled patch (all patients).
    scaler = StandardScaler(with_mean=False).fit(X)
    classifier = LogisticRegression(max_iter=4000, class_weight="balanced", C=1.0, random_state=args.seed)
    classifier.fit(scaler.transform(X), y)
    positive_index = int(classifier.classes_.tolist().index(1))
    classes = ["non-lesion", "lesion"] if positive_index == 1 else ["lesion", "non-lesion"]

    bundle = {
        "scaler": scaler,
        "classifier": classifier,
        "config": dict(CONFIG),
        "classes": classes,
        "feature": "hog-patch-lesion-detector",
        "versions": {"python": platform.python_version(), "numpy": np.__version__, "joblib": joblib.__version__},
    }

    from sklearn import __version__ as sklearn_version

    bundle["versions"]["scikit_learn"] = sklearn_version
    out.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, out / "angiography.joblib")

    metrics = {
        "trained": True,
        "source": "CADICA (42 patients, selected frames annotation)",
        "labels": "frame is from a lesion video (ground-truth boxes present)",
        "evaluation": "patient-grouped stratified cross-validation",
        "groups": "patients",
        "folds": args.folds,
        "seed": args.seed,
        "frame_level": frame_report,
        "patient_level_vessels_affected": patient_report,
        "fusion": {
            "method": "weighted average of the tabular CAD probability and the imaging lesion probability",
            "policy": "The imaging weight is derived from this branch's patient-grouped frame-level ROC-AUC as 2*(AUC-0.5) capped at 0.5, so a near-chance branch cannot move the clinical estimate.",
            "frame_auc": frame_report["roc_auc"],
            "note": "The API reports both component scores and the weights it applied.",
        },
        "runtime": {"python": platform.python_version(), "numpy": np.__version__, "scikit_learn": sklearn_version, "joblib": joblib.__version__, "pillow": Image.__version__},
        "safety": "Research/educational branch only; patient-grouped metrics are estimates, not clinical validation.",
        "elapsed_seconds": round(time.time() - started, 1),
    }
    (out / "angiography_metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"Saved angiography bundle and metrics to {out.resolve()} ({metrics['elapsed_seconds']}s)")


if __name__ == "__main__":
    main()