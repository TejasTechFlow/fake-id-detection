# CyberShield AI - Fake ID Detection on Social Media Using Machine Learning

An academic prototype: a React dashboard and a FastAPI backend that score social media profile features with a trained
scikit-learn model, explain the result, store scan history in SQLite, and export reports.

> **Results are risk assessments, not verdicts.** Every prediction carries the notice: *"This assessment is based on the
> available profile features and the trained model. It is not definitive proof that the account is fake."*

## 1. Introduction and 2. Problem statement
Fake and automated accounts are used for spam and impersonation. Reviewing large numbers of profiles by hand is slow.
This project gives a reviewer a first-pass, explainable risk score for accounts that may deserve a closer look.

## 3. Objectives
Train and compare ML models on labeled profile data, score new profiles, explain which fields influenced the score, and
present everything in a clear dashboard, so the workflow can be explained end to end in a viva.

## 4. Features
Overview dashboard, single-profile analysis, CSV batch analysis (column mapping, per-row error report), scan history
(search, filter, delete, export), analytics with filters, model performance page (metrics, confusion matrix, ROC,
calibration check), dataset validation and in-app training, PDF/CSV reports.

## 5. Technology stack
Frontend: React 18, Vite, TypeScript, Tailwind CSS, Recharts, React Router, React Hook Form, Zod, Framer Motion, Lucide.
UI primitives live in `frontend/src/components/ui.tsx` (shadcn-style, hand-written, no CLI step).
Backend: Python, FastAPI, Pydantic v2, SQLAlchemy, SQLite. ML: pandas, NumPy, scikit-learn, joblib. Reports: ReportLab.

## 6. System architecture
```
React (Vite, :5173)  --REST/JSON-->  FastAPI (:8000)  -->  SQLAlchemy -> SQLite (scan history only)
                                          |
                                          +--> ml/ (features, train, predict) -> trained_models/model.joblib + metrics.json
```

## 7. Machine learning methodology
1. **Validation** (`ml/features.py`): required columns, numeric types, negatives, duplicates, class balance, label encoding.
   Numeric labels (0/1) are never assumed; you state which value means "fake".
2. **Features**: account age, followers, following, posts, followers/following ratio (`followers / (following + 1)`),
   posts per day (`posts / (age + 1)`), log counts, profile picture, bio, verification, activity level. Unknown values are
   encoded as `unknown`, missing numbers are median-imputed. Usernames are never used as features.
3. **Split**: stratified 80/20 split with a fixed seed. Optional account-aware split (group column) or time-based split
   (timestamp column) for datasets that need them.
4. **Models**: Random Forest (baseline) and Logistic Regression, both in a scikit-learn `Pipeline` so preprocessing is fit on
   training data only (no leakage).
5. **Selection**: by mean 5-fold cross-validated ROC-AUC on the training split. The test split is used once for final metrics, so
   validation and test numbers are reported separately.
6. **Calibration**: sigmoid calibration is applied only when there is enough data (300+ training rows, 50+ per class). Otherwise
   the score is labelled an *uncalibrated model score*. The Brier score and a reliability table are reported either way.
7. **Risk score** = 100 x model output for the "fake" class. Bands (configurable, **demonstration only**): Lower 0-34,
   Moderate 35-64, Higher 65-100. Fewer than 4 known fields gives *Insufficient Information*.
8. **Explanation**: global permutation importance (test split) plus a per-profile occlusion analysis: each field's effect is the
   average of (score drop when that field is replaced by the training baseline) and (score gain when only that field is moved
   from a baseline profile to its real value). It describes the model's behaviour, not the truth about the account.

## 8. Dataset requirements
A CSV with one row per account, a label column, and at least `account_age_days, followers, following, posts`. Optional:
`has_profile_pic, has_bio, verified, activity_level`. If your column names differ, supply a mapping such as
`{"followers": "follower_count", "account_age_days": "age"}`. Use only authorized data; keep private datasets out of git
(`data/private/` is ignored).

`data/sample_labeled_dataset.csv` is **synthetic demonstration data** (700 rows). A model trained on it has no real-world capability.

## 9. Model training
Either use the **Model Performance** page (demo dataset or upload your own CSV), or from PowerShell:
```powershell
cd backend
python scripts\train_demo.py
```
Training endpoints accept requests only from localhost unless `ADMIN_TOKEN` is set (then send `X-Admin-Token`; the Settings page stores it).

## 10. Installation (Windows PowerShell)
Requires Python 3.10+ and Node.js 18+.
```powershell
cd fake-id-detection\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

cd ..\frontend
copy .env.example .env
npm install
```
If PowerShell blocks the activation script: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## 11. Start the backend (terminal 1)
```powershell
cd fake-id-detection\backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```
## 12. Start the frontend (terminal 2)
```powershell
cd fake-id-detection\frontend
npm run dev
```
Open http://localhost:5173. First run: **Model Performance -> Synthetic demo dataset -> Train model**.

## 13. API
Interactive docs at http://localhost:8000/docs. Errors use `{"error": {"code", "message", "details"}}`.

| Method | Path | Purpose |
|---|---|---|
| GET | /api/health | backend and model status |
| GET | /api/dashboard | statistics from the database |
| POST | /api/analyze | score one profile (`save` true/false) |
| POST | /api/analyze/batch | score many validated rows; failures reported by row number |
| POST | /api/dataset/validate | validate a labeled CSV (multipart) |
| POST | /api/model/train | train from demo or uploaded CSV (local or admin token) |
| GET | /api/model/metrics | real evaluation metrics |
| GET | /api/history, /api/history/{id} | paginated history with filters; one scan |
| DELETE | /api/history/{id} | delete a scan |
| GET | /api/analytics | aggregated chart data with filters |
| GET | /api/reports/{id}?format=pdf\|csv\|json | report for a scan |

## 14. Sample CSV
Unlabeled batch input (`data/sample_profiles.csv`, synthetic): `profile_ref,platform,account_age_days,followers,following,posts,has_profile_pic,has_bio,verified,activity_level`.
Labeled training data (`data/sample_labeled_dataset.csv`): the same feature columns plus `label` (`genuine` / `fake`).

## 15. Testing
```powershell
cd fake-id-detection\backend
.\.venv\Scripts\Activate.ps1
python -m pytest -q
```
`tests/test_ml.py` covers validation, zero values, missing features, label encoding, single-class data, training and the missing-model case.
`tests/test_api.py` covers health, input validation, prediction, history CRUD, reports, batch errors and CSV errors.

## 16. Screenshots
Add your own after running the app: Overview, Detect Fake ID (with result), Batch Analysis, Model Performance.

## 17. Limitations
Dataset bias affects results; genuine users can look unusual; fake accounts can imitate genuine ones; profile data can be
incomplete or outdated; the app cannot confirm an account's real identity; risk bands are unvalidated demonstration values.
No platform API integration exists: data is entered manually or loaded from authorized datasets. The app never collects
passwords, cookies, tokens or private messages.

## 18. Future enhancements
Time-aware evaluation on real datasets, SHAP explanations, additional models, user authentication, background training jobs.

## 19. Conclusion
The project demonstrates a complete, honest ML workflow: validated data, leakage-free training, comparison on cross-validation,
held-out evaluation, transparent scoring and human-review-oriented output.

## Verification status of this delivery
Verified by running: the ML pipeline (training, selection, prediction, explanations), the ML test suite (8 tests) and PDF/CSV report generation.
**Written but not executed in the build environment** (no network access there): the FastAPI routes, SQLAlchemy layer, API tests and the whole React frontend.
Expect to fix small issues on first run (for example a TypeScript type complaint from `npm run typecheck`).
