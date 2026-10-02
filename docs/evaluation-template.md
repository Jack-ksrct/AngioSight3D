# Evaluation report template

Complete this document after training and before sharing model results. Keep the report with the model version and dataset provenance; do not include identifiable data.

## Data provenance and cohort

- Dataset/version/license:
- Inclusion/exclusion criteria:
- Patient count and collection period:
- Missingness and duplicate handling:
- Target definitions and verified positive label for CAD/LAD/LCX/RCA:
- Excluded predictors and leakage review:

## Method

- Code revision and environment:
- Split strategy, seed, and test fraction:
- Preprocessing and model settings:
- Any threshold selection or calibration:

## Results

Copy per-target sample counts, class counts, accuracy, precision, recall, F1, ROC-AUC, and confusion matrix from `models/metrics.json`. Add confidence intervals and subgroup analysis when the study design supports them.

| Outcome | Positive class | N train/test | Accuracy | Precision | Recall | F1 | ROC-AUC |
|---|---|---:|---:|---:|---:|---:|---:|
| CAD | | | | | | | |
| LAD | | | | | | | |
| LCX | | | | | | | |
| RCA | | | | | | | |

## Limitations and disposition

Describe uncertainty, class imbalance, calibration status, external validation status, subgroup limitations, and whether the results are suitable only for demonstration. Do not call these results clinical validation.
