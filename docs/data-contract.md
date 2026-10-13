# Dataset and preprocessing contract

## Input

The bundled dataset is read from `data/extention of Z-Alizadeh sani   dataset.xlsx`, using its first worksheet by default. The trainer also accepts UTF-8 CSV and `.xlsm` files. The logical targets are overall `CAD` plus `LAD`, `LCX`, and `RCA`; for this workbook, `Cath` is used as the overall CAD target. Other datasets can provide target column names with `--targets CAD LAD LCX RCA` in that logical order. Each target must contain exactly two non-empty classes. Use `--sheet` to select a different Excel worksheet.

All other columns are treated as candidate model features except `CAD`, `LAD`, `LCX`, `RCA`, and `Cath`. Excluding all target columns prevents a vessel or overall diagnosis label from being used to predict another outcome. Review the source data dictionary and explicitly exclude any additional post-diagnosis or procedure-derived fields that could leak the answer.

## Preprocessing

- Rows with a missing value for a particular target are omitted from that target's fit/evaluation.
- Numeric fields receive median imputation with missingness indicators, then standard scaling.
- Categorical fields receive most-frequent imputation and one-hot encoding; unseen categories are ignored at inference.
- Evaluation uses stratified out-of-fold predictions (5 folds by default, seed 42). Each fold fits its own preprocessing pipeline to avoid validation leakage. After evaluation, the deployed model is refit on every labeled row for that target.
- Labels recognized as positive include `1`, `yes`, `true`, `cad`, `disease`, `positive`, `present`, `stenosis`, `stenotic`, and `affected`. Otherwise the lexicographically last class is selected as positive. **Check `positive_class` in `metrics.json` for every target before interpreting output.**

## Review before training

Confirm target meaning, positive class, units, category encodings, missing-value sentinels, duplicate patients, cohort provenance, and usage rights. Convert sentinel values (for example, `?`, `-9`, or impossible values) to missing values before training. Do not include identifiers. Keep the dataset private and out of version control. A 303-row dataset is especially vulnerable to unstable metrics, class imbalance, and optimistic performance estimates.

For this workbook, the trainer normalizes `Sex=Fmale` to `Female` and excludes constant input columns (the source has `Exertional CP=N` in every row). These changes are recorded in `models/metrics.json`; the source workbook is not modified.
