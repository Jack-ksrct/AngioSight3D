# Model card — initial prototype

## Intended use

Educational demonstration and software integration work only. The models are not validated for clinical use and must not influence care decisions.

## Model design

Four independent binary `RandomForestClassifier` pipelines predict CAD, LAD, LCX, and RCA labels. Numeric and categorical preprocessing is inside each scikit-learn pipeline. The fixed holdout metrics and permutation importance in `models/metrics.json` are computed from the held-out rows.

## Evaluation

Accuracy, precision, recall, F1, ROC-AUC, confusion matrix, sample counts, and class counts are reported per outcome. Results are from one stratified random holdout only. They do not establish external validity, subgroup fairness, clinical utility, or probability calibration. Permutation importance is a dataset-level association measure, not an individual explanation or causal effect.

## Known limitations

- Small dataset; performance estimates have high uncertainty.
- No calibration assessment, external validation, decision curve analysis, or prospective evaluation is implemented.
- Default positive-label selection is heuristic and must be checked in the generated metrics.
- The model assumes feature definitions and units at inference match those during training.
- Vessel probabilities are not lesion maps and do not provide location or severity grading.

## Before any clinical research use

Establish governance and dataset rights; validate labels and preprocessing with clinical experts; use leakage-resistant nested or temporal/external validation; report confidence intervals and subgroup results; evaluate calibration; perform human factors and security review; and obtain applicable ethics and regulatory approvals.
