# Model card — initial prototype

## Intended use

Educational demonstration and software integration work only. The models are not validated for clinical use and must not influence care decisions.

## Model design

Four independent binary `RandomForestClassifier` pipelines predict CAD, LAD, LCX, and RCA labels. Numeric and categorical preprocessing is inside each scikit-learn pipeline. The fixed holdout metrics and permutation importance in `models/metrics.json` are computed from the held-out rows.

A second, optional branch scores a single angiography frame using a patch-level lesion detector trained on the CADICA set (a HOG descriptor over 96 px windows, logistic regression). Under patient-grouped cross-validation its frame-level ROC-AUC is about 0.53 — essentially chance — so its contribution to the overall CAD estimate is weighted by its own measured skill, `2 x (AUC - 0.5)` capped at 0.5. In the shipped build that weight is 0.06. The branch is shown and its metrics are reported; it is not allowed to meaningfully override the tabular model. See `docs/imaging-model.md`.

## Evaluation

Accuracy, precision, recall, F1, ROC-AUC, confusion matrix, sample counts, and class counts are reported per outcome. Results are from one stratified random holdout only. They do not establish external validity, subgroup fairness, clinical utility, or probability calibration. Permutation importance is a dataset-level association measure, not an individual explanation or causal effect.

## Known limitations

- Small dataset; performance estimates have high uncertainty.
- No calibration assessment, external validation, decision curve analysis, or prospective evaluation is implemented.
- Default positive-label selection is heuristic and must be checked in the generated metrics.
- The model assumes feature definitions and units at inference match those during training.
- Vessel probabilities are not lesion maps and do not provide location or severity grading.
- The CADICA angiography branch is at chance frame by frame; a single frame carries almost no signal. Its fusion weight is deliberately near zero for this reason.

## Before any clinical research use

Establish governance and dataset rights; validate labels and preprocessing with clinical experts; use leakage-resistant nested or temporal/external validation; report confidence intervals and subgroup results; evaluate calibration; perform human factors and security review; and obtain applicable ethics and regulatory approvals.
