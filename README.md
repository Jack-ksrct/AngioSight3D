<p align="center">
  <img src="frontend/public/logo.png" alt="AngioSight" width="104">
</p>

<h1 align="center">AngioSight</h1>
<p align="center"><strong>Dataset-derived CAD and LAD&nbsp;/&nbsp;LCX&nbsp;/&nbsp;RCA estimates, drawn onto a real anatomical heart.</strong></p>
<p align="center">A research prototype: type in a cardiovascular profile, get a calibrated-looking score — then see which coronary territories the model is talking about, on 89 officially named structures from BodyParts3D.</p>

![AngioSight showing a completed assessment beside the interactive heart](docs/images/app-overview.png)

> ### ⚠️ Research and education only
> **AngioSight is not a medical device.** It must not be used for diagnosis, treatment, triage, or any emergency decision, and its output does not replace clinician assessment or diagnostic imaging. The scores come from a 303-record research dataset. Never enter identifiable patient data.

---

## At a glance

| | |
|---|---|
| Model features | **54** (one constant column dropped at training time) |
| Targets | **4** — overall `CAD`, plus `LAD` / `LCX` / `RCA` stenosis |
| Training records | **303** (227 train / 76 stratified holdout, seed 42) |
| Named 3D regions | **89** — 45 distinct official BodyParts3D concept names |
| Heart geometry | **105,768** triangles, 63,513 vertices, 4 source materials |
| API surface | `GET /health` · `GET /metadata` · `POST /predict` |
| Stack | FastAPI + scikit-learn · React 18 + Vite + Three.js / React&nbsp;Three&nbsp;Fiber |

---

## What it does

- **A 54-field assessment form** grouped into *Profile*, *History*, *Vitals & exam*, *Symptoms*, *Lab panel*, and *Cardiac tests* — with a search box and live "filled / blank" counters. Anything you leave blank is imputed by the backend from training-set statistics, and the UI tells you how many fields that is.
- **One overall CAD probability plus three vessel probabilities**, with the per-vessel class shown honestly (a 0.68 is displayed as *Stenotic*, not quietly promoted to a diagnosis).
- **An optional angiography frame.** Upload a PNG or JPEG and a second model trained on the CADICA angiography set produces a frame-level lesion probability. It is fused into the CAD estimate only in proportion to how well it actually generalises — and in the shipped build that weight is deliberately tiny, because the frame-level branch is near chance (see below). Both component scores are always shown.
- **An interactive heart that recolours with the estimate.** The LAD, LCX and RCA meshes shift through green → amber → red as the model's estimate rises. Hovering any structure names it with the official BodyParts3D term; clicking a coronary selects that vessel.
- **Dark and light themes**, a mobile layout that stacks to one column, touch rotation and pinch zoom, and a PWA manifest.
- **Plain-language boundaries.** Every panel states that it is educational decision support, and the vessel colours are labelled as estimates rather than lesion locations.

## What it deliberately does not do

No accounts, no database, no assessment history, no analytics, no payments. Submitted values and an optional angiography frame go to the API and are processed in memory only — no image is stored or logged. That is an intentional privacy boundary for a single-operator research workflow — **not** a production multi-user security model.

---

## The numbers, honestly

These are holdout scores from the shipped bundle (`models/metrics.json`), stratified 25% split, seed 42, 76 records. **They are not clinical validation.**

| Target | Positive class | Accuracy | Precision | Recall | F1 | ROC-AUC |
|---|---|---:|---:|---:|---:|---:|
| Overall CAD | `CAD` | **84.2%** | 88.9% | 88.9% | 88.9% | 87.9% |
| LAD | `Stenotic` | 80.3% | 79.6% | 88.6% | 83.9% | 83.9% |
| LCX | `Stenotic` | 60.5% | 50.0% | 56.7% | 53.1% | 69.4% |
| RCA | `Stenotic` | 67.1% | 56.7% | 58.6% | 57.6% | 75.0% |

**Read the vessel rows with care.** On a stratified split of this dataset the majority-class baseline is roughly 71% accuracy for CAD, 58% for LAD, 61% for LCX and 62% for RCA. So the CAD and LAD models clearly beat predicting the majority class, RCA beats it only slightly, and **the LCX model's 60.5% accuracy is indistinguishable from always answering "Normal."** Treat LCX as an open problem, not a working output.

Feature ranking for overall CAD, by permutation importance on the holdout (a dataset-level explanation baseline, not a patient-specific or causal one):

`Typical Chest Pain` · `Age` · `Atypical` · `Region RWMA` · `EF-TTE` · `TG` · `FBS` · `Nonanginal` · `BMI` · `Tinversion`

### The imaging branch is honest about being weak

The CADICA angiography branch is a real, reproducible model (`backend/train_angiography.py`), but patient-grouped cross-validation shows it does **not** generalise frame by frame:

| Level | Metric | Value |
|---|---|---:|
| Frame | ROC-AUC | **0.53** (chance) |
| Frame | Balanced accuracy | 0.50 |
| Patient (mean across many frames) | Ranking ROC-AUC | 0.81 |

The patch classifier is strong on the patches it saw, but the hottest-window score on unseen patients is chance-level — with 42 patients it appears to learn patient-specific appearance, not a transferable lesion cue. Because of that, the fusion weight is derived from the branch's own AUC, `2 × (AUC − 0.5)` capped at 0.5, which in this build is **0.06**: the frame cannot meaningfully move the clinical estimate, and the API says so. Full write-up: **[docs/imaging-model.md](docs/imaging-model.md)**.

---

## Quick start

**Requirements:** Python 3.12+, Node.js 22+ (CI uses 24), pnpm 11.19.0, and a browser with WebGL. The app runs in any modern desktop or mobile browser; it is not a native binary. Install pnpm with `npm install --global pnpm@11.19.0`.

### Windows

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\windows\setup.ps1          # one-time: venv + pnpm install
.\scripts\windows\train-models.ps1   # only needed once, to build models/
.\scripts\windows\start-api.ps1      # terminal 1 -> http://localhost:8000
.\scripts\windows\start-web.ps1      # terminal 2 -> http://localhost:5173
```

### macOS / Linux

```sh
bash scripts/unix/setup.sh
bash scripts/unix/train-models.sh
bash scripts/unix/start-api.sh       # terminal 1
bash scripts/unix/start-web.sh       # terminal 2
```

### Manual

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

```powershell
cd frontend
pnpm run dev
```

The API serves interactive docs at <http://localhost:8000/docs> during local runs. Docs are **disabled by default in Docker** — set `ENABLE_API_DOCS=true` only on a trusted development machine.

### Train the models

The pipeline reads `data/extention of Z-Alizadeh sani   dataset.xlsx` (first worksheet) and also accepts `.csv` and `.xlsm`. Run from the repository root:

```powershell
python -m backend.train --data "data/extention of Z-Alizadeh sani   dataset.xlsx" --output models
```

`Cath` is recognised as the overall CAD target and `LAD` / `LCX` / `RCA` as the vessel targets; all four are excluded from the inputs. Override with `--targets CAD LAD LCX RCA`, or supply `--positive-labels ...` when the positive class cannot be inferred. **Inspect `models/metrics.json` before trusting the API.** If the app was already open during training, restart the API and reload the browser so the new feature schema is picked up. The API refuses to predict until a bundle exists.

To build the optional angiography branch, point the trainer at a CADICA archive:

```powershell
python -m backend.train_angiography --zip path\to\cadica.zip --output models
```

It reads the zip directly (never extracts it), writes `models/angiography.joblib` and `models/angiography_metrics.json`, and takes several minutes because it scans 6,126 frames. Without it, the app simply runs tabular-only; the upload control reports that the imaging branch is unavailable. See **[docs/imaging-model.md](docs/imaging-model.md)** for the method and the honest metrics.

For a container run: `docker compose up --build` after training. The model directory is mounted read-only into the API container.

### Open it from a phone or tablet

Start both services, then browse to `http://<computer-LAN-address>:5173`. Find the address with `ipconfig` (Windows) or `ip addr` / `ifconfig` (macOS, Linux). Stay on a trusted network and allow port 5173 through the firewall if needed. Do not expose this prototype to the public internet.

---

## The 3D heart, and where every name comes from

The viewer draws an assembly of BodyParts3D 4.0 elements — heart structures, the ascending aorta and arch, the superior vena cava, the pulmonary trunk, and the named coronary branches. Long inferior vena cava segments are omitted to keep the initial view focused.

The `.obj` format carries **no anatomical names**, so nothing is guessed from geometry:

- `scripts/build_bodyparts3d_heart.py` rebuilds the assembly from the official release archive and element manifest.
- `scripts/build_anatomy_labels.py` resolves all **89** regions to names using the release's own IS-A tables (`isa_element_parts.txt` + `isa_inclusion_relation_list.txt`) — for each region, the deepest concept that contains it. All 89 resolve with no ties, giving 45 distinct official English names. It regenerates `frontend/src/anatomyLabels.js` byte-for-byte.
- The coronary veins and great vessels carry no material of their own in the shipped `.mtl`, so their **anatomy group** supplies their colour. Only the coronary arteries are coloured by estimate.

Attribution, licence, citation, and the full list of modifications: **[docs/anatomy-attribution.md](docs/anatomy-attribution.md)** — BodyParts3D, © The Database Center for Life Science, licensed under **CC BY 4.0**.

**The colours are estimates, not anatomy.** The dataset carries patient-level vessel labels and no lesion coordinates, so nothing in this app locates or sizes a stenosis.

---

## Repository layout

```
backend/    FastAPI app, training pipeline, offline boundary tests
frontend/   React assessment app + lazy-loaded Three.js anatomy viewer
scripts/    Platform run scripts + reproducible BodyParts3D build tooling
docs/       Architecture, data contract, model card, safety, attribution
data/       Authorized dataset goes here (git-ignored)
models/     Trained bundle + metrics.json (git-ignored)
```

## Documentation

| Document | What it covers |
|---|---|
| [Architecture & API contract](docs/architecture.md) | Service layout, endpoints, request/response shapes |
| [Dataset & preprocessing contract](docs/data-contract.md) | Columns, encodings, imputation rules |
| [Model card](docs/model-card.md) | Intended use, metrics, failure modes |
| [Imaging branch](docs/imaging-model.md) | CADICA lesion detector, honest metrics, fusion policy |
| [Safety & privacy](docs/safety-and-privacy.md) | Data handling, deployment boundaries |
| [Anatomy attribution](docs/anatomy-attribution.md) | BodyParts3D source, licence, region naming |
| [Demo storyboard](docs/demo-script.md) | Walkthrough for a recorded demo |
| [Evaluation template](docs/evaluation-template.md) | Write-up scaffold for your own results |

## Verification

```powershell
python -m unittest backend.test_api backend.test_imaging -v   # API boundary + imaging tests
cd frontend; pnpm install --frozen-lockfile
pnpm run check:framing                     # 15 viewport shapes: heart stays inside the frame
pnpm run build                             # production bundle
```

`check:framing` is a real regression guard, not a smoke test. It re-derives the viewer's camera frame from its own source constants, projects the heart's bounds through 15 canvas shapes down to 140&nbsp;px wide, and fails if the silhouette would be clipped or leave less than a 2&nbsp;px margin. It also fails if the viewer is ever changed to read Three.js's `state.viewport` again — that property is measured at unit distance, not at the camera, and using it silently breaks the framing.

GitHub Actions runs the Python tests and the frontend build on every push. **CI does not deploy anything.**

---

## Limitations

- The dataset is small (~303 records), so holdout scores move substantially between splits. Do not describe a single random split as clinical validation.
- The vessel models are uneven. LCX in particular performs at roughly the majority-class baseline.
- Scores are uncalibrated probabilities from a gradient-boosting pipeline; per-patient risk is not what they represent.
- Class balance is skewed (216/303 records are `CAD`), which inflates apparent accuracy.
- Anatomy labels are generic BodyParts3D reference geometry, not patient-specific anatomy or any kind of imaging.
- `Exertional CP` was dropped from the feature set for having no variance in this dataset.
- The CADICA imaging branch is at chance frame by frame (ROC-AUC ≈ 0.53 under patient-grouped CV). It is shown and fusion-weighted honestly, but a single frame carries almost no signal and must not be treated as a finding.
- No TLS, no authentication, no multi-user isolation. Do not put this on the public internet.

## Before using this for real

1. Verify the dataset licence, worksheet, target mappings, and positive classes.
2. Have a domain expert review the preprocessing and target definitions.
3. Re-run evaluation with stratified cross-validation and report uncertainty, not one split.
4. Treat clinical and technical validation as prerequisites, not follow-ups.

---

<sub>Built for research and education. Not a medical device. <a href="https://creativecommons.org/licenses/by/4.0/">BodyParts3D</a> geometry © The Database Center for Life Science, CC BY 4.0.</sub>
