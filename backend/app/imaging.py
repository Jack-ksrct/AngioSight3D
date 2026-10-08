"""Angiography branch: CADICA image model loading and inference.

The model is a patch-level lesion detector trained on CADICA ground-truth box
annotations (see backend/train_angiography.py). At inference a frame is scanned
with a sliding window and the lesion probability is the hottest window. The
patch geometry and HOG settings here must stay in lock-step with the trainer;
tests pin them (backend/test_imaging.py).

Small enough to load lazily; the API treats the imaging branch as optional, so
a missing bundle degrades gracefully to tabular-only predictions.
"""
from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image

CONFIG = {
    "patch": 96,
    "stride": 48,
    "max_side": 1024,
    "orientations": 9,
    "pixels_per_cell": 8,
    "cells_per_block": 2,
}


def load_imaging_bundle(model_dir: str | Path):
    path = Path(model_dir) / "angiography.joblib"
    if not path.exists():
        return None
    bundle = __import__("joblib").load(path)
    required = {"scaler", "classifier", "config", "classes"}
    if not required <= set(bundle):
        raise ValueError("The angiography bundle is missing required components.")
    if tuple(bundle["classes"]) not in (("non-lesion", "lesion"), ("normal", "lesion")):
        raise ValueError("The angiography bundle has an unexpected class list.")
    if not callable(getattr(bundle["classifier"], "predict_proba", None)):
        raise ValueError("The angiography classifier must expose predict_proba.")
    return bundle


def _from_skimage_hog(cell: np.ndarray, cfg: dict) -> np.ndarray:
    from skimage.feature import hog

    return hog(
        cell,
        orientations=cfg["orientations"],
        pixels_per_cell=(cfg["pixels_per_cell"], cfg["pixels_per_cell"]),
        cells_per_block=(cfg["cells_per_block"], cfg["cells_per_block"]),
        block_norm="L2-Hys",
        transform_sqrt=True,
        feature_vector=True,
    )


def frame_to_grayscale(image_bytes: bytes, cfg: dict | None = None) -> np.ndarray:
    """Decode an angiography frame to a float32 grayscale array in [0, 1]."""
    cfg = cfg or CONFIG
    try:
        image = Image.open(io.BytesIO(image_bytes))
        image.load()
        image = image.convert("L")
    except (OSError, ValueError) as exc:
        raise ValueError("The frame could not be decoded as a PNG or JPEG image.") from exc
    width, height = image.size
    if max(width, height) > cfg["max_side"]:
        ratio = cfg["max_side"] / float(max(width, height))
        image = image.resize((max(1, round(width * ratio)), max(1, round(height * ratio))), Image.LANCZOS)
    return np.asarray(image, dtype=np.float32) / 255.0


def window_features(arr: np.ndarray, cfg: dict | None = None) -> np.ndarray:
    """HOG vectors for every sliding patch; shape (n_windows, n_features)."""
    cfg = cfg or CONFIG
    patch, stride = cfg["patch"], cfg["stride"]
    height, width = arr.shape
    if min(height, width) < patch:
        image = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
        image = image.resize((patch, patch), Image.LANCZOS)
        arr = np.asarray(image, dtype=np.float32) / 255.0
        height, width = arr.shape
    xs = list(range(0, width - patch + 1, stride)) or [max(0, width - patch)]
    ys = list(range(0, height - patch + 1, stride)) or [max(0, height - patch)]
    vectors = [_from_skimage_hog(arr[y : y + patch, x : x + patch], cfg) for y in ys for x in xs]
    return np.asarray(vectors, dtype=np.float32)


def predict_lesion(bundle: dict, image_bytes: bytes) -> dict:
    """Run the imaging branch on one frame.

    Returns the hottest-window probability plus diagnostics. Raises ValueError
    on un-decodable input; the API turns that into a 422 for the caller.
    """
    config = {**CONFIG, **(bundle.get("config") or {})}
    arr = frame_to_grayscale(image_bytes, config)
    features = window_features(arr, config)
    scaled = bundle["scaler"].transform(features)
    probabilities = bundle["classifier"].predict_proba(scaled)[:, 1]
    # Positive index: classes are ordered [non-lesion, lesion] by the trainer's
    # LabelEncoder semantics, but trust the stored mapping instead of a guess.
    classes = list(bundle["classes"])
    if "lesion" not in classes:
        raise ValueError("The angiography bundle does not declare a lesion class.")
    positive = classes.index("lesion")
    probabilities = probabilities if positive == 1 else 1.0 - probabilities
    return {
        "lesion_probability": float(np.max(probabilities)),
        "mean_window_probability": float(np.mean(probabilities)),
        "windows": int(len(probabilities)),
        "positive_class": classes[positive],
    }


def metadata(model_dir: str | Path):
    path = Path(model_dir) / "angiography_metrics.json"
    if not path.exists():
        return None
    import json

    return json.loads(path.read_text(encoding="utf-8"))