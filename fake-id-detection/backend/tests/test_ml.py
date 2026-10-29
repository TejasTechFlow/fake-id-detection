"""ML pipeline tests (no web framework needed)."""
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.ml.features import DatasetError, engineer, parse_label, validate_dataset
from app.ml.predict import ModelNotAvailable, load_artifact, predict_profiles
from app.ml.train import train_model

DATA = Path(__file__).resolve().parents[2] / "data" / "sample_labeled_dataset.csv"


def _df():
    return pd.read_csv(DATA)


def test_zero_followers_and_zero_age_are_safe():
    df = pd.DataFrame([{"account_age_days": 0, "followers": 0, "following": 0, "posts": 0}])
    X = engineer(df)
    assert np.isfinite(X[["followers_following_ratio", "posts_per_day"]].to_numpy()).all()


def test_missing_features_become_unknown_not_errors():
    X = engineer(pd.DataFrame([{"account_age_days": 10, "followers": None, "following": 5, "posts": 1}]))
    assert X["has_bio"].iloc[0] == "unknown" and np.isnan(X["followers"].iloc[0])


def test_missing_required_columns_rejected():
    with pytest.raises(DatasetError, match="Missing required columns"):
        validate_dataset(pd.DataFrame({"a": [1], "label": ["fake"]}), "label")


def test_single_class_dataset_rejected():
    df = _df().head(30).copy()
    df["label"] = "fake"
    with pytest.raises(DatasetError):
        validate_dataset(df, "label")


def test_numeric_label_encoding_is_never_assumed():
    with pytest.raises(DatasetError, match="positive_label"):
        parse_label(pd.Series([0, 1, 0, 1]))
    y, _ = parse_label(pd.Series([0, 1, 0, 1]), positive_label="1")
    assert list(y) == [0, 1, 0, 1]


def test_invalid_numeric_values_rejected():
    df = _df().head(50).copy()
    df["followers"] = df["followers"].astype(object)
    df.loc[0, "followers"] = "abc"
    df.loc[1, "followers"] = -5
    with pytest.raises(DatasetError, match="followers"):
        validate_dataset(df, "label")


def test_training_and_prediction_roundtrip():
    d = Path(tempfile.mkdtemp())
    m = train_model(_df(), "label", dataset_name="demo", is_synthetic=True, out_dir=d)
    assert m["selected_model"] in {"random_forest", "logistic_regression"}
    assert set(m["comparison"]) == {"random_forest", "logistic_regression"}
    assert any("SYNTHETIC" in w for w in m["warnings"])
    assert 0.0 <= m["test"]["roc_auc"] <= 1.0
    art = load_artifact(d)
    sus, fine, thin = predict_profiles([
        dict(account_age_days=5, followers=2, following=900, posts=0, has_profile_pic="no", has_bio="no"),
        dict(account_age_days=2000, followers=900, following=300, posts=500, has_profile_pic="yes", has_bio="yes"),
        dict(account_age_days=100)], art)
    assert sus["risk_score"] > fine["risk_score"]
    assert thin["prediction"] == "Insufficient Information"
    assert "not definitive proof" in sus["disclaimer"]


def test_missing_model_raises():
    with pytest.raises(ModelNotAvailable):
        load_artifact(Path(tempfile.mkdtemp()))
