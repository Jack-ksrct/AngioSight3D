# Angiography imaging branch (CADICA)

AngioSight has two model branches:

1. **Tabular branch** — a RandomForest trained on the Z-Alizadeh Sani cohort. It
   predicts four targets (`CAD`, `LAD`, `LCX`, `RCA`) from 54 clinical features.
   This is the branch the 3D heart and the vessel rows are driven by.
2. **Imaging branch** — a patch-level lesion detector trained on **CADICA**
   angiography frames. It returns a stand-alone frame score. It does not alter
   the clinical estimate because the app cannot verify that an uploaded frame
   belongs to the same patient as the entered clinical values.

This document describes the imaging branch, its measured performance, and the
patient-link boundary in the shipped build.

## Dataset

CADICA (`MMIV-ML/CADICA`) is a coronary angiography set of **42 patients**.
Each patient folder ships lists of *selected* frames for their lesion and
non-lesion videos, plus ground-truth lesion bounding boxes for lesion frames.

| Property | Value |
|---|---|
| Patients | 42 |
| Selected frames | 6,126 (3,996 lesion / 2,130 non-lesion) |
| Ground-truth lesion boxes | one or more per lesion frame |
| Frame label | a frame is positive iff it comes from a lesion video |
| Patient label | `Number of vessels affected > 0` (32 positive / 10 negative) |

Frame labels line up exactly with the video type: a lesion video always carries
at least one ground-truth box. Missing values are never fabricated — CADICA
records with no value stay blank.

The zip is read directly. It is never extracted (the archive is several
gigabytes).

## Method

1. **Patches.** Positive training patches are the annotated lesion boxes,
   cropped and resized to 96×96. Negative patches are random 96×96 crops from
   non-lesion frames.
2. **Features.** A HOG descriptor (9 orientations, 8 px cells, 2×2 blocks,
   L2-Hys, transform-sqrt) — 4,356 dimensions per patch.
3. **Classifier.** Logistic regression (`class_weight="balanced"`).
4. **Frame scoring.** At inference the 96 px window is slid over the
   full-resolution frame with a 48 px stride; the frame score is the **hottest**
   window probability. The mean window probability and window count are also
   reported.
5. **Evaluation.** `StratifiedGroupKFold` on the patient id, so frames of the
   same patient never appear in both train and test. The served model is then
   refit on every patch of every patient.

The feature geometry lives in `backend/app/imaging.py` (`CONFIG`) and
`backend/train_angiography.py` (`CONFIG`). They must stay identical; the trainer
and the inference module are tested against the same window sizes.

## The numbers, honestly

Frame-level results under 5-fold patient-grouped cross-validation:

| Level | Metric | Value |
|---|---|---:|
| Frame | ROC-AUC | **0.53** |
| Frame | Accuracy | 0.65 |
| Frame | Balanced accuracy | 0.50 |
| Patient, ranking by **max** frame score | ROC-AUC | 0.55 |
| Patient, max frame score at threshold 0.5 | Accuracy | 0.76 |

At that patient threshold the confusion matrix is `[[0, 10], [0, 32]]`: every
patient is predicted positive. The 0.76 accuracy is therefore just the positive
class prevalence, not useful discrimination.

**The frame-level branch is essentially at chance.** The patch classifier is
strong on the patches it was trained on, but the hottest-window score does not
transfer to unseen patients. With only 42 patients, the model appears to learn
patient-specific appearance (contrast, catheter, anatomy) rather than a
transferable lesion cue.

The API keeps this trained artifact for reproducibility but **does not return
frame probabilities** unless patient-grouped frame AUC, frame balanced
accuracy, and patient AUC are each above the no-skill baseline, and the saved
patient threshold predicts both classes. The current artifact fails these
checks (balanced accuracy 0.4985 and all-positive patient predictions), so an
image request receives `IMAGING_QUALITY_INSUFFICIENT` while the clinical
prediction remains available. Passing this minimum gate would not establish
clinical validity.

The saved evaluation artifact contains max-frame patient ranking (AUC 0.55),
not the earlier exploratory mean-frame score. The displayed single-frame score
is not a patient-level CADICA profile and cannot be used to infer a patient's
CADICA clinical metadata.

Whole-frame classifiers (HOG over the whole frame, downsampled intensity, and
others) were also tried and were all chance-level (AUC 0.51–0.58). The
patch-detector results above are the best honest frame-level result obtained.

## Patient-link boundary

The original implementation fused the uploaded frame with the current form
values using a weight derived from frame AUC. However, the clinical model is
trained on the separate Z-Alizadeh Sani cohort, while the uploaded image can be
any frame and has no required CADICA patient identifier. A skill-based weight
does not establish that the two inputs belong to the same patient. When image
scoring is enabled, the API reports the frame score separately and keeps the
CAD estimate unchanged. The current low-quality artifact is gated as above.

The official CADICA archive contains `metadata.xlsx` with patient clinical data
and patient-keyed video folders. The archive is not included in this checkout;
only the trained imaging bundle and metrics are present. The trainer now rejects
missing, duplicate, invalid, or mismatched patient metadata labels instead of
silently treating absent labels as negative. A complete app-side patient
catalog, clinical-field mapping, and frame-to-patient selection still require
the archive and a reviewed mapping between its metadata columns and the
Z-Alizadeh model's 54 input features.

## API

`POST /predict` accepts an optional `image` field — base64 PNG or JPEG, or a
`data:` URL (the prefix is stripped). Requests are capped at 6 MiB with image
payloads up to 5 MiB decoded. Only PNG and JPEG magic bytes are accepted.

```jsonc
{
  "features": { "Age": 60, "Sex": "Male" },
  "image": "<base64 PNG/JPEG>"
}
```

The response adds:

```jsonc
{
  "imaging": {
    "loaded": true,
    "applied": true,
    "lesion_probability": 0.31,
    "mean_window_probability": 0.22,
    "windows": 81,
    "positive_class": "lesion"
  },
  "fusion": {
    "applied": false,
    "method": "disabled_without_verified_patient_link",
    "tabular_weight": 1.0,
    "imaging_weight": 0.0,
    "reason": "The uploaded frame has no verified patient identifier matching the clinical assessment."
  }
}
```

The `CAD` estimate remains unchanged. The imaging block contains the separate
stand-alone frame score.

## Reproduce

```powershell
python -m backend.train_angiography --zip path\to\cadica.zip --output models
```

This writes `models/angiography.joblib` and `models/angiography_metrics.json`.
It is a one-off job (the patient-grouped frame scan over 6,126 frames dominates
the runtime). The UI reads the metrics from `GET /metadata` and shows the frame
and patient AUCs exactly as recorded.

## Boundaries

- Research and education only. Not a diagnosis and not clinical validation.
- The imaging branch does **not** localise or size a lesion. The hottest window
  is not an annotation.
- Only 42 patients; metrics will move under different splits.
- Source: CADICA, `https://github.com/MMIV-ML/CADICA`. Check its licence and
  citation before redistribution.
