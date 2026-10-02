# CardioMap — CAD Risk Visualization Prototype

An educational and research web application for exploring dataset-derived CAD and LAD/LCX/RCA estimates beside an interactive 3D anatomical reference.

> **Clinical safety:** This software is for educational and research use only. It is not a medical device and must not be used for diagnosis, treatment, or emergency decisions. Predictions do not replace clinician assessment or diagnostic imaging.

## Project layout

- `backend/` — FastAPI prediction API, preprocessing/training pipeline, and evaluation.
- `frontend/` — responsive React assessment app and lazy-loaded Three.js anatomy viewer.
- `data/` — place the authorized dataset here (ignored by Git).
- `models/` — trained model bundle output (ignored by Git).

## Quick start

Requirements: Python 3.12+, Node.js 22+, pnpm 11.19.0, and a current browser with WebGL support. The responsive web app supports desktop, tablet, and mobile browsers on Windows, macOS, Linux, Android, and iOS/iPadOS. It is not a native Android or iOS binary. The manifest supports browser installation where available; HTTPS is required for full PWA installation outside localhost. Install pnpm with `npm install --global pnpm@11.19.0` if it is not already installed.

One-time setup on Windows:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\windows\setup.ps1
```

### 1. Python API

Run `.\scripts\windows\start-api.ps1` from the project root (or use the commands below if you prefer manual setup).

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

The local run scripts enable interactive API docs at http://localhost:8000/docs. Docs are disabled by default in Docker; set `ENABLE_API_DOCS=true` only for trusted development.

On macOS/Linux, run `bash scripts/unix/setup.sh` once, then use `bash scripts/unix/start-api.sh` and `bash scripts/unix/start-web.sh` in separate terminals. PowerShell scripts are grouped under `scripts/windows/`. Docker Compose is available on all three desktop operating systems.

### 2. Frontend

In another terminal:

Run `.\scripts\windows\start-web.ps1` from the project root, or `cd frontend; pnpm run dev`.

### 3. Train models

The provided Excel dataset is read from `data/extention of Z-Alizadeh sani   dataset.xlsx` on the first worksheet. The training script also accepts `.csv` and `.xlsm` input files. Run from the repository root:

Run `.\scripts\windows\train-models.ps1` from the project root, or:

```powershell
python -m backend.train --data "data/extention of Z-Alizadeh sani   dataset.xlsx" --output models
```

The dataset uses `Cath` as its overall CAD target and `LAD`, `LCX`, `RCA` as vessel targets. The pipeline recognizes `Cath` as the default CAD target and excludes all four target columns from inputs. For other files, configure names with `--targets CAD LAD LCX RCA` (actual headers in that logical order). Use `--positive-labels ...` with exact positive values only when they cannot be inferred. Inspect class mappings and `models/metrics.json` before using the API. If the app was already open during training, restart the API and refresh the browser to load the new feature schema.

For a container-based run after training, use `docker compose up --build`. The model directory is mounted read-only into the API container.

### Use from a phone or tablet on the same Wi-Fi

Start both services on a computer, then open `http://<computer-LAN-address>:5173` in the mobile device's browser. Find the computer's LAN address using `ipconfig` (Windows) or `ip addr` / `ifconfig` (macOS/Linux). The frontend dev server and Docker web service accept LAN connections and proxy `/api` requests to the local backend. Keep the device and computer on the same trusted network and allow the frontend port through the computer's firewall if needed. Do not expose this prototype to the public internet or enter identifiable patient data.

On phones and tablets the 3D view supports touch rotation and pinch zoom, and the layout stacks into one column. A current browser with WebGL is required.

## Dataset notes

The suggested Z-Alizadeh Sani extension is small (about 303 records), so reported validation scores can vary substantially. Use stratified cross-validation, report uncertainty and class balance, and do not describe a random split score as clinical validation. Confirm dataset license, provenance, column definitions, missing value encodings, and target semantics before training. Never commit patient data or trained artifacts containing sensitive data.

The training script uses a stratified holdout and reports accuracy, precision, recall, F1, ROC-AUC, confusion matrix, and class prevalence for each target. Preprocessing is fit only on the training partition. Permutation importance is computed on the holdout set as a lightweight, dataset-level explanation baseline; it is not a causal or patient-specific explanation.

## 3D mapping

The viewer uses a compacted and oriented assembly of 87 anatomical elements from the official BodyParts3D 4.0 OBJ release (`frontend/public/models/bodyparts3d-heart.obj` and `.mtl`). Named coronary branch meshes are colored by their model estimates; the source dataset provides vessel-level labels, not lesion coordinates. This does not imply a physical lesion location or extent. The build script is `scripts/build_bodyparts3d_heart.py`. See [anatomy asset attribution](docs/anatomy-attribution.md).

## Documentation

- [Architecture and API contract](docs/architecture.md)
- [Dataset and preprocessing contract](docs/data-contract.md)
- [Model card](docs/model-card.md)
- [Safety and privacy](docs/safety-and-privacy.md)
- [Demo video storyboard](docs/demo-script.md)
- [Evaluation report template](docs/evaluation-template.md)

Run the offline API boundary/model mapping tests with `python -m unittest backend.test_api -v`. Build the client with `cd frontend && pnpm install --frozen-lockfile && pnpm run build`. The CI workflow runs these same checks; it does not deploy the app.

## Application boundaries

CardioMap does not have user accounts, a database, assessment history, uploads, third-party analytics, or an email/payment integration. Assessment values are sent to the configured API and processed in memory; the app does not persist them. This is an intentional privacy boundary for the current single-operator research workflow, not a complete multi-user security model. The local Docker configuration adds request-size/rate limits and security headers but does not provide TLS, authentication, or clinical approval. Do not expose it to the public internet.

## Safety and limitations

- Model output is an estimate from a small dataset, not a diagnosis or calibrated individual risk unless calibration is separately evaluated.
- Do not enter identifiable health data into a deployed/public instance.
- The API refuses prediction until a model bundle has been trained.
- The UI prominently labels every output as educational decision support.

## Next steps

1. Verify the dataset license, worksheet, target mappings, and positive classes.
2. Review preprocessing decisions and target definitions with a domain expert.
3. Train, inspect class-wise metrics and errors, and document limitations.
4. Validate clinically and technically before any real-world use.
