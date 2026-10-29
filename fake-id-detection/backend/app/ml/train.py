"""Training pipeline: validate -> engineer -> split -> cross-validate two models -> evaluate -> save.

Model selection uses cross-validation on the TRAINING portion only. The held-out test set is used once,
for the final reported metrics, so validation metrics and test metrics are kept separate.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, brier_score_loss, confusion_matrix, f1_score,
                             precision_score, recall_score, roc_auc_score, roc_curve)
from sklearn.model_selection import GroupShuffleSplit, StratifiedKFold, cross_validate, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from app.core.config import settings
from app.ml.features import (CAT_LEVELS, CATEGORICAL, FEATURES, NUMERIC, apply_mapping, engineer,
                             parse_label, validate_dataset)

RANDOM_STATE = 42
MODEL_FILE = "model.joblib"
METRICS_FILE = "metrics.json"


def build_pipeline(kind: str) -> Pipeline:
    pre = ColumnTransformer([
        ("num", Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler())]), NUMERIC),
        ("cat", OneHotEncoder(categories=[CAT_LEVELS[c] for c in CATEGORICAL], handle_unknown="ignore"), CATEGORICAL),
    ])
    if kind == "random_forest":
        clf = RandomForestClassifier(n_estimators=200, min_samples_leaf=3, class_weight="balanced",
                                     random_state=RANDOM_STATE, n_jobs=1)
    elif kind == "logistic_regression":
        clf = LogisticRegression(max_iter=2000, class_weight="balanced", random_state=RANDOM_STATE)
    else:
        raise ValueError(kind)
    return Pipeline([("pre", pre), ("clf", clf)])


def _metrics(y_true, y_pred, y_score) -> dict:
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    out = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "confusion_matrix": {"tn": int(cm[0, 0]), "fp": int(cm[0, 1]), "fn": int(cm[1, 0]), "tp": int(cm[1, 1])},
        "roc_auc": None,
    }
    if len(set(y_true)) == 2:
        out["roc_auc"] = float(roc_auc_score(y_true, y_score))
    return out


def _split(X, y, df, group_col, time_col, test_size):
    if time_col and time_col in df.columns:
        order = pd.to_datetime(df[time_col], errors="coerce").argsort().to_numpy()
        cut = int(len(order) * (1 - test_size))
        tr, te = order[:cut], order[cut:]
        return tr, te, f"time-based split on '{time_col}' (oldest {100 - int(test_size * 100)}% train, newest {int(test_size * 100)}% test)"
    if group_col and group_col in df.columns:
        gss = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=RANDOM_STATE)
        tr, te = next(gss.split(X, y, groups=df[group_col]))
        return tr, te, f"account-aware GroupShuffleSplit on '{group_col}' (no account appears in both sets)"
    idx = np.arange(len(X))
    tr, te = train_test_split(idx, test_size=test_size, stratify=y, random_state=RANDOM_STATE)
    return tr, te, f"stratified random split, test_size={test_size}, random_state={RANDOM_STATE}"


def train_model(df: pd.DataFrame, target: str, mapping=None, positive_label=None, group_column=None,
                time_column=None, dataset_name="uploaded dataset", is_synthetic=False, test_size=0.2,
                out_dir: Path | None = None) -> dict:
    """Train both models, select by CV ROC-AUC, evaluate on held-out test data, persist artifacts."""
    out_dir = Path(out_dir or settings.model_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    report = validate_dataset(df, target, mapping, positive_label)
    df = df.drop_duplicates().reset_index(drop=True)
    y, label_info = parse_label(df[target], positive_label)
    X = engineer(apply_mapping(df, mapping))
    tr, te, split_desc = _split(X, y, df, group_column, time_column, test_size)
    Xtr, Xte, ytr, yte = X.iloc[tr], X.iloc[te], y.iloc[tr], y.iloc[te]
    warnings = list(report["warnings"])
    if len(set(yte)) < 2:
        raise ValueError("Test split contains a single class; use a larger dataset or a different split.")
    n_splits = int(min(5, ytr.sum(), (1 - ytr).sum()))
    comparison, fitted = {}, {}
    for kind in ("random_forest", "logistic_regression"):
        pipe = build_pipeline(kind)
        entry = {"cv_roc_auc": None, "cv_f1": None}
        if n_splits >= 2:
            cv = cross_validate(pipe, Xtr, ytr, cv=StratifiedKFold(n_splits, shuffle=True, random_state=RANDOM_STATE),
                                scoring=["roc_auc", "f1"])
            entry.update(cv_roc_auc=float(cv["test_roc_auc"].mean()), cv_roc_auc_std=float(cv["test_roc_auc"].std()),
                         cv_f1=float(cv["test_f1"].mean()), cv_folds=n_splits)
        else:
            warnings.append("Too few examples for cross-validation; model selection falls back to test-set ROC-AUC.")
        pipe.fit(Xtr, ytr)
        proba = pipe.predict_proba(Xte)[:, 1]
        entry["test"] = _metrics(yte, (proba >= 0.5).astype(int), proba)
        comparison[kind], fitted[kind] = entry, pipe
    key = "cv_roc_auc" if n_splits >= 2 else None
    if key:
        selected = max(comparison, key=lambda k: comparison[k][key])
        select_basis = "highest mean cross-validated ROC-AUC on the training split"
    else:
        selected = max(comparison, key=lambda k: comparison[k]["test"]["roc_auc"] or 0)
        select_basis = "highest test ROC-AUC (cross-validation not possible; this selection is optimistic)"
    # Optional probability calibration (needs enough data to be meaningful)
    calibrated = False
    final = fitted[selected]
    if len(ytr) >= 300 and min(ytr.sum(), (1 - ytr).sum()) >= 50:
        final = CalibratedClassifierCV(build_pipeline(selected), method="sigmoid", cv=3).fit(Xtr, ytr)
        calibrated = True
    else:
        warnings.append("Dataset too small to calibrate probabilities: the risk score is an UNCALIBRATED model score, not a probability.")
    proba = final.predict_proba(Xte)[:, 1]
    test = _metrics(yte, (proba >= 0.5).astype(int), proba)
    test["brier_score"] = float(brier_score_loss(yte, proba))
    fpr, tpr, _ = roc_curve(yte, proba)
    step = max(1, len(fpr) // 60)
    roc = [{"fpr": float(a), "tpr": float(b)} for a, b in zip(fpr[::step], tpr[::step])]
    # reliability bins (calibration check)
    bins = np.clip((proba * 5).astype(int), 0, 4)
    reliability = [{"bin": f"{b * 20}-{b * 20 + 20}%", "n": int((bins == b).sum()),
                    "mean_score": float(proba[bins == b].mean()), "observed_rate": float(yte.to_numpy()[bins == b].mean())}
                   for b in range(5) if (bins == b).any()]
    # global importance: permutation importance on raw features (model-agnostic, test split)
    pi = permutation_importance(fitted[selected], Xte, yte, scoring="roc_auc", n_repeats=5, random_state=RANDOM_STATE)
    importance = sorted([{"feature": f, "importance": float(max(m, 0.0))} for f, m in zip(FEATURES, pi.importances_mean)],
                        key=lambda d: -d["importance"])
    base = {f: float(Xtr[f].median()) for f in NUMERIC}
    base.update({f: Xtr[f].mode().iloc[0] for f in CATEGORICAL})
    if len(df) < 100:
        warnings.append("Small dataset: reported metrics are unreliable and must not be read as real-world performance.")
    if is_synthetic:
        warnings.append("SYNTHETIC DEMONSTRATION DATA: this model has NO real-world detection capability.")
    version = datetime.now(timezone.utc).strftime("v%Y%m%d-%H%M%S")
    metrics = {
        "model_version": version, "selected_model": selected, "selection_basis": select_basis,
        "trained_at": datetime.now(timezone.utc).isoformat(), "dataset_name": dataset_name, "is_synthetic": is_synthetic,
        "dataset": {"rows": int(len(df)), "train_rows": int(len(tr)), "test_rows": int(len(te)),
                    "class_distribution": report["class_distribution"]},
        "split_method": split_desc, "n_features": len(FEATURES), "features": FEATURES,
        "calibrated": calibrated, "comparison": comparison, "test": test, "roc_curve": roc,
        "reliability": reliability, "feature_importance": importance, "warnings": warnings,
        "label": label_info,
        "limitations": [
            "Results depend entirely on the training dataset and may carry its biases.",
            "Genuine users can look unusual; fake accounts can imitate genuine ones.",
            "Test metrics describe this dataset only, not real-world performance.",
            "A risk score is not proof that an account is fake."],
    }
    joblib.dump({"model": final, "version": version, "baseline": base, "calibrated": calibrated, "selected": selected,
                 "feature_importance": importance, "train_range": {f: [float(Xtr[f].min()), float(Xtr[f].max())] for f in NUMERIC}},
                out_dir / MODEL_FILE)
    (out_dir / METRICS_FILE).write_text(json.dumps(metrics, indent=2))
    return metrics
