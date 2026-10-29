"""Inference and per-profile explanation.

Scoring method: risk_score = 100 * P(class=fake) from the trained model. If the model was probability-calibrated
the score is calibrated; otherwise it is an UNCALIBRATED model score (flagged in every response).

Local explanation: occlusion analysis. For each known input field we average (a) the score drop when that
field alone is replaced by the training baseline (median / most common value) and (b) the score gain when only
that field is moved from an all-baseline profile to its real value. This is a transparent, model-agnostic
alternative to SHAP. It explains this model's behaviour only; it does not prove anything about the account.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from app.core.config import settings
from app.ml.features import CATEGORICAL, NUMERIC_BASE, engineer
from app.ml.train import METRICS_FILE, MODEL_FILE

DISCLAIMER = ("This assessment is based on the available profile features and the trained model. "
              "It is not definitive proof that the account is fake.")
LABEL_GENUINE = "Likely Genuine"
LABEL_SUSPICIOUS = "Suspicious — Review Recommended"
LABEL_INSUFFICIENT = "Insufficient Information"
FIELD_NAMES = {"account_age_days": "Account age", "followers": "Follower count", "following": "Following count",
               "posts": "Post count", "has_profile_pic": "Profile picture", "has_bio": "Bio",
               "verified": "Verification status", "activity_level": "Recent activity"}


class ModelNotAvailable(RuntimeError):
    pass


def model_dir() -> Path:
    return settings.model_dir


@lru_cache(maxsize=2)
def _load(path: str, mtime: float):
    return joblib.load(path)


def load_artifact(directory: Path | None = None) -> dict:
    p = Path(directory or model_dir()) / MODEL_FILE
    if not p.exists():
        raise ModelNotAvailable("No trained model found. Upload a labeled dataset and train the model to view performance metrics.")
    return _load(str(p), p.stat().st_mtime)


def load_metrics(directory: Path | None = None) -> dict | None:
    p = Path(directory or model_dir()) / METRICS_FILE
    return json.loads(p.read_text()) if p.exists() else None


def model_available(directory: Path | None = None) -> bool:
    return (Path(directory or model_dir()) / MODEL_FILE).exists()


def categorize(score: float) -> str:
    if score <= settings.low_max:
        return "lower"
    if score <= settings.moderate_max:
        return "moderate"
    return "higher"


def _present(v) -> bool:
    return v is not None and not (isinstance(v, float) and np.isnan(v)) and str(v).strip().lower() not in {"", "unknown"}


def _describe(field: str, value, delta: float) -> str:
    name = FIELD_NAMES[field]
    direction = "raised" if delta > 0 else "lowered"
    if field in NUMERIC_BASE:
        shown = f"{float(value):,.0f}"
        extra = " days" if field == "account_age_days" else ""
        return f"{name} ({shown}{extra}) {direction} the model score relative to a typical training profile."
    return f"{name} ('{str(value).replace('_', ' ')}') {direction} the model score relative to a typical training profile."


def _score(model, row: dict) -> float:
    return float(model.predict_proba(engineer(pd.DataFrame([row])))[:, 1][0] * 100.0)


def predict_profiles(rows: list[dict], artifact: dict | None = None) -> list[dict]:
    art = artifact or load_artifact()
    model, base = art["model"], art["baseline"]
    df = pd.DataFrame(rows)
    X = engineer(df)
    scores = model.predict_proba(X)[:, 1] * 100.0
    results = []
    for i, row in enumerate(rows):
        score = float(scores[i])
        known = [f for f in NUMERIC_BASE + CATEGORICAL if _present(row.get(f))]
        missing = [f for f in NUMERIC_BASE + CATEGORICAL if f not in known]
        warnings = []
        if missing:
            warnings.append("Missing or unknown fields: " + ", ".join(FIELD_NAMES[m] for m in missing) + ". Missing numeric values are imputed.")
        for f in NUMERIC_BASE:
            lo, hi = art["train_range"].get(f, [None, None])
            v = pd.to_numeric(row.get(f), errors="coerce")
            if lo is not None and pd.notna(v) and (v < lo or v > hi):
                warnings.append(f"{FIELD_NAMES[f]} ({v:,.0f}) is outside the range seen in training data; the prediction may be unreliable.")
        if not art["calibrated"]:
            warnings.append("Risk score is an uncalibrated model score, not a probability.")
        factors = []
        all_base = {f: base[f] for f in NUMERIC_BASE + CATEGORICAL}
        base_score = _score(model, all_base)
        for f in known:
            loo = score - _score(model, {**row, f: base[f]})
            add = _score(model, {**all_base, f: row.get(f)}) - base_score
            delta = (loo + add) / 2.0
            if abs(delta) >= 1.0:
                factors.append({"feature": f, "label": FIELD_NAMES[f], "value": row.get(f), "impact": round(delta, 1),
                                "direction": "increases_risk" if delta > 0 else "decreases_risk",
                                "explanation": _describe(f, row.get(f), delta)})
        factors.sort(key=lambda d: -abs(d["impact"]))
        if len(known) < settings.min_known_fields:
            label, category = LABEL_INSUFFICIENT, "insufficient"
            warnings.append(f"Only {len(known)} of 8 fields were provided; at least {settings.min_known_fields} are needed for an assessment.")
        else:
            category = categorize(score)
            label = LABEL_GENUINE if category == "lower" else LABEL_SUSPICIOUS
        verify = ["Check the profile manually on the platform using only publicly accessible information.",
                  "Compare against other signals the model did not measure (content, interactions, linked accounts)."]
        if missing:
            verify.insert(0, "Obtain the missing fields: " + ", ".join(FIELD_NAMES[m] for m in missing) + ".")
        results.append({
            "prediction": label, "risk_category": category, "risk_score": round(score, 1),
            "score_type": "calibrated probability x 100" if art["calibrated"] else "uncalibrated model score",
            "model_version": art["version"], "model_name": art["selected"],
            "features_used": [f for f in known], "missing_fields": missing,
            "contributing_factors": factors[:6], "warnings": warnings, "what_to_verify": verify,
            "disclaimer": DISCLAIMER,
            "thresholds": {"lower_max": settings.low_max, "moderate_max": settings.moderate_max},
        })
    return results
