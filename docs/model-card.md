# Model card — initial prototype

## Intended use

Educational demonstration and software integration work only. The models are not validated for clinical use and must not influence care decisions.

## Model design

Four independent binary `RandomForestClassifier` pipelines predict CAD, LAD, LCX, and RCA labels. Numeric and categorical preprocessing is inside each scikit-learn pipeline. The fixed holdout metrics and permutation importance in `models/metrics.json` are computed from the held-out rows.

A second, optional branch contains a patch-level lesion detector trained on CADICA (HOG descriptors over 96 px windows and logistic regression). Under patient-grouped cross-validation its frame-level ROC-AUC is about 0.53, essentially chance. The API withholds frame probabilities while its grouped metrics fail the no-skill/class-coverage gate; it never fuses image scores into the CAD estimate because uploaded frames have no verified link to the entered clinical profile. See `docs/imaging-model.md`.

The assessment also returns a patient-input sensitivity view for CAD. It starts from the CAD pipeline's fitted training-set median/mode reference profile, replaces one user-supplied feature at a time with the entered value, and reports the probability difference. This provides the entered measurement beside a relative model sensitivity. It is not SHAP, LIME, an additive explanation, a causal effect, or a clinical interpretation; interactions between features are not captured. Blank inputs are not shown.

## Evaluation

Accuracy, precision, recall, F1, ROC-AUC, confusion matrix, sample counts, and class counts are reported per outcome. Results are from one stratified random holdout only. They do not establish external validity, subgroup fairness, clinical utility, or probability calibration. Permutation importance is a dataset-level association measure, not an individual explanation or causal effect.

## Known limitations

- Small dataset; performance estimates have high uncertainty.
- No calibration assessment, external validation, decision curve analysis, or prospective evaluation is implemented.
- Default positive-label selection is heuristic and must be checked in the generated metrics.
- The model assumes feature definitions and units at inference match those during training.
- Vessel probabilities are not lesion maps and do not provide location or severity grading.
- The patient-input sensitivity display is a one-feature-at-a-time reference comparison; it can change with the chosen reference and does not explain feature interactions.
- The CADICA angiography branch is at chance frame by frame; a single frame carries almost no signal. It remains separate from the clinical estimate until a verified same-patient link is available.

## Before any clinical research use

Establish governance and dataset rights; validate labels and preprocessing with clinical experts; use leakage-resistant nested or temporal/external validation; report confidence intervals and subgroup results; evaluate calibration; perform human factors and security review; and obtain applicable ethics and regulatory approvals.
