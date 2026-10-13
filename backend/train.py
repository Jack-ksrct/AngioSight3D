"""Evaluate clinical classifiers with stratified CV, then refit on all rows."""
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
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import accuracy_score, balanced_accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
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
    parser.add_argument("--folds", type=int, default=5, help="Number of stratified cross-validation folds (minimum 2).")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if args.folds < 2:
        parser.error("--folds must be at least 2")
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
            raise ValueError(f"Target {column!r} has too few examples for stratified cross-validation: {negative_label}={int(counts[0])}, {positive_label}={int(counts[1])}")
        n_splits = min(args.folds, int(counts.min()))
        pipeline = Pipeline([("preprocess", clone(preprocess)), ("classifier", RandomForestClassifier(n_estimators=300, class_weight="balanced", min_samples_leaf=2, random_state=args.seed, n_jobs=-1))])
        cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=args.seed)
        # Each fold fits preprocessing independently, so imputation/scaling/encoding
        # cannot learn from its validation rows. OOF predictions cover every row.
        proba = cross_val_predict(pipeline, x, y, cv=cv, method="predict_proba", n_jobs=1)[:, 1]
        pred = (proba >= 0.5).astype(int)
        fold_auc = []
        importances = []
        for fold_index, (train_idx, valid_idx) in enumerate(cv.split(x, y)):
            fold_model = clone(pipeline).fit(x.iloc[train_idx], y[train_idx])
            fold_proba = fold_model.predict_proba(x.iloc[valid_idx])[:, 1]
            fold_auc.append(float(roc_auc_score(y[valid_idx], fold_proba)))
            try:
                imp = permutation_importance(fold_model, x.iloc[valid_idx], y[valid_idx], n_repeats=3, random_state=args.seed + fold_index, scoring="roc_auc")
                importances.append(imp.importances_mean)
            except Exception:
                pass
        report = {"positive_class": positive_label, "classes": [negative_label, positive_label], "n": int(len(y)), "evaluation": "stratified_out_of_fold", "folds": n_splits, "class_counts": {negative_label: int((y == 0).sum()), positive_label: int((y == 1).sum())}, "accuracy": float(accuracy_score(y, pred)), "balanced_accuracy": float(balanced_accuracy_score(y, pred)), "precision": float(precision_score(y, pred, zero_division=0)), "recall": float(recall_score(y, pred, zero_division=0)), "f1": float(f1_score(y, pred, zero_division=0)), "roc_auc": float(roc_auc_score(y, proba)), "roc_auc_fold_mean": float(np.mean(fold_auc)), "roc_auc_fold_std": float(np.std(fold_auc, ddof=1)) if len(fold_auc) > 1 else 0.0, "confusion_matrix": confusion_matrix(y, pred).tolist()}
        if importances:
            mean_importance = np.mean(importances, axis=0)
            std_importance = np.std(importances, axis=0, ddof=1) if len(importances) > 1 else np.zeros_like(mean_importance)
            report["permutation_importance"] = sorted([{"feature": str(f), "mean": float(m), "std": float(s)} for f, m, s in zip(feature_columns, mean_importance, std_importance)], key=lambda z: z["mean"], reverse=True)[:15]
        # The deployed artifact uses every available labeled row after evaluation.
        pipeline.fit(x, y)
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
    (out / "metrics.json").write_text(json.dumps({"trained": True, "seed": args.seed, "evaluation_method": "stratified cross-validation with out-of-fold predictions; deployed pipelines refit on all labeled rows", "requested_folds": args.folds, "source_data": data_path.name, "source_sheet": source_sheet, "target_columns": target_columns, "constant_features_excluded": constant_features, "categorical_normalizations": {"Sex: Fmale -> Female": sex_normalized_count} if sex_normalized_count else {}, "features": feature_columns, "feature_schema": schema, "targets": reports, "runtime": {"python": platform.python_version(), "numpy": np.__version__, "pandas": pd.__version__, "scikit_learn": sklearn.__version__, "joblib": joblib.__version__}, "safety": "Research/educational only; not clinical validation."}, indent=2), encoding="utf-8")
    print(f"Saved model bundle and metrics to {out.resolve()}")


if __name__ == "__main__":
    main()
