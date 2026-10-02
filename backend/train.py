"""Train leakage-aware binary classifiers and write holdout metrics."""
import argparse
import json
import platform
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
import sklearn
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder, StandardScaler, LabelEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
from sklearn.inspection import permutation_importance

TARGETS = ["CAD", "LAD", "LCX", "RCA"]
EXCLUDE = {"cad", "lad", "lcx", "rca", "cath"}


def find_column(columns, wanted):
    lookup = {str(c).strip().casefold(): c for c in columns}
    for name in wanted:
        if name.casefold() in lookup:
            return lookup[name.casefold()]
    raise ValueError(f"Target {wanted[0]!r} not found. Available columns: {list(columns)}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/extention of Z-Alizadeh sani   dataset.xlsx")
    parser.add_argument("--output", default="models")
    parser.add_argument("--sheet", default=None, help="Excel worksheet name. Defaults to the first worksheet.")
    parser.add_argument("--targets", nargs=4, default=TARGETS, metavar=("CAD", "LAD", "LCX", "RCA"))
    parser.add_argument("--positive-labels", nargs=4, default=None, metavar=("CAD", "LAD", "LCX", "RCA"), help="Optional exact positive class labels in CAD, LAD, LCX, RCA order")
    parser.add_argument("--test-size", type=float, default=0.25)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    data_path, out = Path(args.data), Path(args.output)
    source_sheet = None
    if data_path.suffix.casefold() in {".xlsx", ".xlsm"}:
        source_sheet = args.sheet or pd.ExcelFile(data_path).sheet_names[0]
        df = pd.read_excel(data_path, sheet_name=source_sheet)
    elif data_path.suffix.casefold() == ".csv":
        df = pd.read_csv(data_path)
    else:
        raise ValueError("Supported input formats are .csv, .xlsx, and .xlsm")
    target_columns = {
        logical: find_column(df.columns, [column] + (["Cath"] if logical == "CAD" and column.casefold() == "cad" else []))
        for logical, column in zip(TARGETS, args.targets)
    }
    excluded = EXCLUDE | {str(column).strip().casefold() for column in target_columns.values()}
    feature_columns = [c for c in df.columns if str(c).strip().casefold() not in excluded]
    if not feature_columns:
        raise ValueError("No input features remain after excluding targets and Cath.")
    X = df[feature_columns].replace([np.inf, -np.inf], np.nan).copy()
    for column in X.select_dtypes(exclude=np.number).columns:
        X[column] = X[column].map(lambda value: value.strip() if isinstance(value, str) else value)
    sex_normalized_count = 0
    if "Sex" in X.columns:
        sex_mask = X["Sex"].astype("string").str.casefold().eq("fmale")
        sex_normalized_count = int(sex_mask.sum())
        X.loc[sex_mask, "Sex"] = "Female"
    constant_features = [column for column in X.columns if X[column].nunique(dropna=True) <= 1]
    X = X.drop(columns=constant_features)
    feature_columns = list(X.columns)
    if not feature_columns:
        raise ValueError("No variable input features remain after removing constant columns.")
    numeric = list(X.select_dtypes(include=np.number).columns)
    categorical = [c for c in X.columns if c not in numeric]
    preprocess = ColumnTransformer([
        ("numeric", Pipeline([("impute", SimpleImputer(strategy="median", add_indicator=True)), ("scale", StandardScaler())]), numeric),
        ("categorical", Pipeline([("impute", SimpleImputer(strategy="most_frequent")), ("encode", OneHotEncoder(handle_unknown="ignore"))]), categorical),
    ], remainder="drop")
    models, reports = {}, {}
    for logical_name, column in target_columns.items():
        y_text = df[column].astype("string").str.strip()
        valid = y_text.notna() & y_text.ne("")
        y_raw = y_text.loc[valid].astype(str)
        labels = sorted(y_raw.unique())
        if len(labels) != 2:
            raise ValueError(f"Target {column!r} must have exactly two non-null classes; found {labels}")
        encoder = LabelEncoder().fit(y_raw)
        class_values = [str(v) for v in encoder.classes_]
        positive_tokens = {"1", "yes", "true", "cad", "disease", "positive", "present", "stenosis", "stenotic", "affected"}
        requested_positive = args.positive_labels[TARGETS.index(logical_name)] if args.positive_labels else None
        if requested_positive is not None and requested_positive not in class_values:
            raise ValueError(f"Requested positive label {requested_positive!r} for {logical_name} is not present in {class_values}")
        positive_candidates = [v for v in class_values if v.strip().casefold() in positive_tokens]
        positive_label = requested_positive or (positive_candidates[0] if positive_candidates else class_values[-1])
        negative_label = next(v for v in class_values if v != positive_label)
        y = np.asarray([1 if str(v) == positive_label else 0 for v in y_raw], dtype=int)
        x = X.loc[valid]
        counts = np.bincount(y)
        if counts.min() < 2:
            raise ValueError(f"Target {column!r} has too few examples in a class for stratified holdout: {negative_label}={int(counts[0])}, {positive_label}={int(counts[1])}")
        x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=args.test_size, random_state=args.seed, stratify=y)
        pipeline = Pipeline([("preprocess", clone(preprocess)), ("classifier", RandomForestClassifier(n_estimators=300, class_weight="balanced", min_samples_leaf=2, random_state=args.seed, n_jobs=-1))])
        pipeline.fit(x_train, y_train)
        pred = pipeline.predict(x_test)
        proba = pipeline.predict_proba(x_test)[:, 1]
        report = {"positive_class": positive_label, "classes": [negative_label, positive_label], "n": int(len(y)), "train_n": int(len(y_train)), "test_n": int(len(y_test)), "class_counts": {negative_label: int((y == 0).sum()), positive_label: int((y == 1).sum())}, "accuracy": float(accuracy_score(y_test, pred)), "precision": float(precision_score(y_test, pred, zero_division=0)), "recall": float(recall_score(y_test, pred, zero_division=0)), "f1": float(f1_score(y_test, pred, zero_division=0)), "roc_auc": float(roc_auc_score(y_test, proba)), "confusion_matrix": confusion_matrix(y_test, pred).tolist()}
        try:
            imp = permutation_importance(pipeline, x_test, y_test, n_repeats=5, random_state=args.seed, scoring="roc_auc")
            report["permutation_importance"] = sorted([{"feature": str(f), "mean": float(m), "std": float(s)} for f, m, s in zip(feature_columns, imp.importances_mean, imp.importances_std)], key=lambda z: z["mean"], reverse=True)[:15]
        except Exception as exc:
            report["permutation_importance_error"] = str(exc)
        models[logical_name] = {"pipeline": pipeline, "classes": [negative_label, positive_label]}
        reports[logical_name] = report
    out.mkdir(parents=True, exist_ok=True)
    joblib.dump({"models": {k: v["pipeline"] for k, v in models.items()}, "features": list(feature_columns), "classes": {k: v["classes"] for k, v in models.items()}}, out / "bundle.joblib")
    schema = {}
    for col in feature_columns:
        if col in numeric:
            schema[str(col)] = {"type": "number"}
        else:
            values = sorted(str(v) for v in X[col].dropna().unique())
            schema[str(col)] = {"type": "category", "options": values[:100]}
    (out / "metrics.json").write_text(json.dumps({"trained": True, "seed": args.seed, "test_size": args.test_size, "source_data": data_path.name, "source_sheet": source_sheet, "target_columns": target_columns, "constant_features_excluded": constant_features, "categorical_normalizations": {"Sex: Fmale -> Female": sex_normalized_count} if sex_normalized_count else {}, "features": feature_columns, "feature_schema": schema, "targets": reports, "runtime": {"python": platform.python_version(), "numpy": np.__version__, "pandas": pd.__version__, "scikit_learn": sklearn.__version__, "joblib": joblib.__version__}, "safety": "Research/educational only; not clinical validation."}, indent=2), encoding="utf-8")
    print(f"Saved model bundle and metrics to {out.resolve()}")


if __name__ == "__main__":
    main()
