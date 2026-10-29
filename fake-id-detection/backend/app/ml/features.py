"""Feature mapping, dataset validation and feature engineering.

Usernames / direct identifiers are never used as predictive features.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

NUMERIC_BASE = ["account_age_days", "followers", "following", "posts"]
CATEGORICAL = ["has_profile_pic", "has_bio", "verified", "activity_level"]
ENGINEERED = ["followers_following_ratio", "posts_per_day", "log_followers", "log_following"]
NUMERIC = NUMERIC_BASE + ENGINEERED
FEATURES = NUMERIC + CATEGORICAL
CAT_LEVELS = {
    "has_profile_pic": ["yes", "no", "unknown"],
    "has_bio": ["yes", "no", "unknown"],
    "verified": ["verified", "not_verified", "unknown"],
    "activity_level": ["low", "medium", "high", "unknown"],
}
REQUIRED_COLUMNS = ["account_age_days", "followers", "following", "posts"]
DEFAULT_MAPPING = {c: c for c in NUMERIC_BASE + CATEGORICAL}  # canonical name -> dataset column
LIMITS = {"account_age_days": 40000, "followers": 5_000_000_000, "following": 10_000_000, "posts": 10_000_000}


class DatasetError(ValueError):
    """Raised with a user-readable message when a dataset is unsuitable."""


def _is_missing(v) -> bool:
    return v is None or (isinstance(v, float) and np.isnan(v)) or (isinstance(v, str) and not v.strip())


def norm_bool(v) -> str:
    if _is_missing(v):
        return "unknown"
    s = str(v).strip().lower()
    if s in {"1", "1.0", "true", "yes", "y", "t"}:
        return "yes"
    if s in {"0", "0.0", "false", "no", "n", "f"}:
        return "no"
    return "unknown"


def norm_verified(v) -> str:
    if _is_missing(v):
        return "unknown"
    s = str(v).strip().lower()
    if s == "verified":
        return "verified"
    if s in {"not_verified", "not verified", "unverified"}:
        return "not_verified"
    return {"yes": "verified", "no": "not_verified"}.get(norm_bool(v), "unknown")


def norm_activity(v) -> str:
    s = "" if _is_missing(v) else str(v).strip().lower()
    return s if s in {"low", "medium", "high"} else "unknown"


def engineer(df: pd.DataFrame) -> pd.DataFrame:
    """Build the model feature matrix from canonical columns. Safe for zeros and missing values."""
    out = pd.DataFrame(index=df.index)
    for c in NUMERIC_BASE:
        out[c] = pd.to_numeric(df[c], errors="coerce") if c in df else np.nan
    out["followers_following_ratio"] = out["followers"] / (out["following"] + 1.0)
    out["posts_per_day"] = out["posts"] / (out["account_age_days"] + 1.0)
    out["log_followers"] = np.log1p(out["followers"].clip(lower=0))
    out["log_following"] = np.log1p(out["following"].clip(lower=0))
    for c in ("has_profile_pic", "has_bio"):
        out[c] = df[c].map(norm_bool) if c in df else "unknown"
    out["verified"] = df["verified"].map(norm_verified) if "verified" in df else "unknown"
    out["activity_level"] = df["activity_level"].map(norm_activity) if "activity_level" in df else "unknown"
    return out[FEATURES]


def parse_label(series: pd.Series, positive_label=None):
    """Convert a target column to 0 (genuine) / 1 (fake).

    The encoding is never assumed. Without `positive_label`, only unambiguous text labels
    such as 'fake' or 'bot' are auto-detected; numeric 0/1 must be declared explicitly.
    """
    norm = series.astype(str).str.strip().str.lower()
    uniq = sorted(norm[series.notna()].unique())
    if len(uniq) != 2:
        raise DatasetError(f"Target column must contain exactly 2 classes, found {len(uniq)}: {uniq[:10]}")
    if positive_label is not None:
        pos = str(positive_label).strip().lower()
        if pos not in uniq:
            raise DatasetError(f"Positive label '{positive_label}' not found in target column. Values present: {uniq}")
    else:
        found = [u for u in uniq if u in {"fake", "bot", "spam", "suspicious", "fraud", "fraudulent"}]
        if len(found) != 1:
            raise DatasetError(
                f"Cannot infer label encoding from values {uniq}. Provide 'positive_label' (the value that means fake). "
                "Numeric encodings such as 0/1 differ between datasets and are never assumed.")
        pos = found[0]
    y = norm.eq(pos).astype(int)
    return y, {"positive_label": pos, "classes_found": uniq}


def apply_mapping(df: pd.DataFrame, mapping=None) -> pd.DataFrame:
    mapping = {**DEFAULT_MAPPING, **(mapping or {})}
    out = pd.DataFrame(index=df.index)
    for canon, col in mapping.items():
        if col and col in df.columns:
            out[canon] = df[col]
    return out


def validate_dataset(df: pd.DataFrame, target: str, mapping=None, positive_label=None) -> dict:
    """Return a validation report, or raise DatasetError for unusable datasets."""
    warnings = []
    if target not in df.columns:
        raise DatasetError(f"Target column '{target}' not found. Columns present: {list(df.columns)}")
    mapped = apply_mapping(df, mapping)
    missing = [c for c in REQUIRED_COLUMNS if c not in mapped.columns]
    if missing:
        raise DatasetError(f"Missing required columns after mapping: {missing}. Use the feature mapping to point to your column names.")
    errors = []
    for c in NUMERIC_BASE:
        coerced = pd.to_numeric(mapped[c], errors="coerce")
        bad = int((coerced.isna() & mapped[c].notna()).sum())
        if bad:
            errors.append(f"Column '{c}' has {bad} non-numeric values.")
        neg = int((coerced < 0).sum())
        if neg:
            errors.append(f"Column '{c}' has {neg} negative values.")
    if errors:
        raise DatasetError(" ".join(errors))
    y, label_info = parse_label(df[target], positive_label)
    n = len(df)
    dup = int(df.duplicated().sum())
    miss = {c: int(mapped[c].isna().sum()) for c in mapped.columns if mapped[c].isna().any()}
    n_fake, n_gen = int(y.sum()), int((1 - y).sum())
    if min(n_fake, n_gen) == 0:
        raise DatasetError("Dataset contains only one class. Both genuine and fake examples are required.")
    if n < 100:
        warnings.append(f"Only {n} rows: metrics will be unreliable. Use a larger authorized dataset.")
    if min(n_fake, n_gen) < 20:
        warnings.append("The minority class has fewer than 20 examples; results are statistically weak.")
    if min(n_fake, n_gen) / n < 0.2:
        warnings.append("Classes are imbalanced. Accuracy alone can be misleading, so rely on precision, recall, F1 and ROC-AUC.")
    if dup:
        warnings.append(f"{dup} duplicate rows found; duplicates are dropped before training.")
    return {"ok": True, "rows": n, "columns": list(df.columns), "duplicates": dup, "missing_values": miss,
            "class_distribution": {"genuine": n_gen, "fake": n_fake}, "label": label_info, "warnings": warnings}
