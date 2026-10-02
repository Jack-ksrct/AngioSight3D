"""Shared preprocessing and model bundle loading for training and inference."""
from pathlib import Path
import json
import joblib

DEFAULT_TARGETS = ["CAD", "LAD", "LCX", "RCA"]
LEAKAGE_COLUMNS = {"lad", "lcx", "rca", "cath"}


def load_bundle(model_dir: str | Path):
    path = Path(model_dir) / "bundle.joblib"
    if not path.exists():
        return None
    return joblib.load(path)


def metadata(model_dir: str | Path):
    path = Path(model_dir) / "metrics.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))
