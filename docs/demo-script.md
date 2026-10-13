# Demonstration video storyboard (3–10 minutes)

Suggested runtime: 5–6 minutes. Record with synthetic/example values only unless the data owner explicitly approves use of de-identified data. Keep the safety disclaimer visible in the opening and closing frames.

1. **Opening and scope (0:00–0:35):** Introduce AngioSight as an educational prototype. Read the on-screen disclaimer. Explain that the BodyParts3D heart and coronary meshes are anatomical references; their colors show vessel-level estimates and the model does not locate lesions.
2. **Project structure (0:35–1:15):** Show `backend/`, `frontend/`, `data/`, `models/`, and the architecture diagram. Point out that data and model artifacts stay local and are gitignored.
3. **Dataset contract (1:15–2:00):** Show the provided Excel workbook in `data/`, explain target columns, leakage exclusions (Cath and all vessel labels), positive-class review, and the small-sample limitation. Do not reveal patient information.
4. **Training and evaluation (2:00–3:00):** Run `scripts/windows/train-models.ps1` (or its Unix counterpart), open `models/metrics.json`, and describe the stratified out-of-fold evaluation, class counts, metric set, and why these small-cohort estimates are not clinical validation.
5. **App workflow (3:00–4:45):** Start the API and web UI, enter synthetic values, request estimates, rotate/zoom the heart, select LAD/LCX/RCA, and inspect the overall CAD estimate and global feature importance. Explain that blank values use training-set imputation.
6. **Technical handoff and limits (4:45–5:30):** Show `/docs`, the API contract, and future work: external validation, calibration, review of the anatomical display, privacy review, and governance.

Avoid implying that the color bands are clinical categories, that model importance explains one patient, or that a predicted probability is a calibrated risk.
