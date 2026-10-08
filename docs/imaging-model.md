# Angiography imaging branch (CADICA)

AngioSight has two model branches:

1. **Tabular branch** — a RandomForest trained on the Z-Alizadeh Sani cohort. It
   predicts four targets (`CAD`, `LAD`, `LCX`, `RCA`) from 54 clinical features.
   This is the branch the 3D heart and the vessel rows are driven by.
2. **Imaging branch** — a patch-level lesion detector trained on **CADICA**
   angiography frames. It contributes an optional, clearly-labelled probability
   that is fused into the overall `CAD` estimate only in proportion to how well
   it actually generalises.

This document describes the imaging branch, its honest metrics, and why its
weight is small in the shipped build.

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
| Patient (vessels affected > 0), ranking by mean frame score | ROC-AUC | 0.81 |
| Patient, ranking by **max** frame score | ROC-AUC | 0.55 |

**The frame-level branch is essentially at chance.** The patch classifier is
strong on the patches it was trained on, but the hottest-window score does not
transfer to unseen patients. With only 42 patients, the model appears to learn
patient-specific appearance (contrast, catheter, anatomy) rather than a
transferable lesion cue.

The patient-level mean AUC of 0.81 is the one encouraging signal, but it
requires aggregating many frames of one patient — it is **not** available from a
single uploaded frame, which is what the app accepts.

Whole-frame classifiers (HOG over the whole frame, downsampled intensity, and
others) were also tried and were all chance-level (AUC 0.51–0.58). The
patch-detector results above are the best honest frame-level result obtained.

## Fusion policy

Because the frame-level branch is near chance, it must not silently move a
clinical estimate. The fusion weight is therefore derived from the branch's own
cross-validated frame AUC:

```
imaging_weight = clamp( 2 × (frame_AUC − 0.5), 0.0, 0.5 )
```

- AUC ≤ 0.50 → weight 0 — the branch cannot change the estimate.
- AUC 0.53 (this build) → weight 0.06 — a token, transparent contribution.
- AUC ≥ 0.75 → the branch is allowed up to half the fused estimate.

The response always reports the tabular score, the imaging score, the applied
weights, the frame AUC the weight came from, and the window count. Nothing is
hidden. If the branch is at chance, the API says so and leaves `CAD` unchanged.

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
    "applied": true,
    "method": "weighted average ...",
    "tabular_weight": 0.94,
    "imaging_weight": 0.06,
    "frame_auc": 0.53,
    "basis": "imaging weight = 2 x (frame-grouped AUC - 0.5), capped at 0.5"
  }
}
```

When `CAD` is fused, `predictions.CAD.components` holds the separate
`tabular` and `imaging` probabilities.

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