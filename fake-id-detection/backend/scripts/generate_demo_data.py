"""Generate SYNTHETIC demonstration data (not real accounts, not real-world behaviour).

Writes data/sample_labeled_dataset.csv (labeled, for the training demo) and data/sample_profiles.csv
(unlabeled, for the batch demo). A model trained on this data has no real-world detection capability.
"""
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
rng = np.random.default_rng(7)


def make(n_genuine: int, n_fake: int) -> pd.DataFrame:
    rows = []
    for i in range(n_genuine):
        age = int(rng.gamma(3, 300)) + 30
        fol = int(rng.lognormal(5.5, 1.3))
        fing = int(rng.lognormal(5.3, 0.9))
        rows.append(dict(account_age_days=age, followers=fol, following=fing,
                         posts=int(rng.gamma(2, 25) * (age / 365 + 0.5)),
                         has_profile_pic=rng.choice(["yes", "no"], p=[0.93, 0.07]),
                         has_bio=rng.choice(["yes", "no"], p=[0.78, 0.22]),
                         verified=rng.choice(["verified", "not_verified"], p=[0.04, 0.96]),
                         activity_level=rng.choice(["low", "medium", "high"], p=[0.35, 0.45, 0.2]),
                         label="genuine"))
    for i in range(n_fake):
        age = int(rng.gamma(1.5, 80)) + 1
        fol = int(rng.lognormal(3.3, 1.3))
        fing = int(rng.lognormal(6.2, 0.9))
        rows.append(dict(account_age_days=age, followers=fol, following=fing,
                         posts=int(rng.gamma(1.2, 12)),
                         has_profile_pic=rng.choice(["yes", "no"], p=[0.55, 0.45]),
                         has_bio=rng.choice(["yes", "no"], p=[0.35, 0.65]),
                         verified=rng.choice(["verified", "not_verified"], p=[0.005, 0.995]),
                         activity_level=rng.choice(["low", "medium", "high"], p=[0.3, 0.25, 0.45]),
                         label="fake"))
    df = pd.DataFrame(rows)
    # overlap: a share of each class behaves like the other (real accounts are not cleanly separable)
    n = len(df)
    gen_idx = df.index[(df.label == "genuine")].to_numpy()
    fake_idx = df.index[(df.label == "fake")].to_numpy()
    cols = ["account_age_days", "followers", "following", "posts"]
    a = rng.choice(fake_idx, int(0.18 * len(fake_idx)), replace=False)
    b = rng.choice(gen_idx, int(0.10 * len(gen_idx)), replace=False)
    sa, sb = df.loc[b, cols].to_numpy().copy(), df.loc[a, cols].to_numpy().copy()
    k = min(len(a), len(b))
    df.loc[a[:k], cols] = sa[:k]
    df.loc[b[:k], cols] = sb[:k]
    # swapped followers/following + missing values: some genuine look suspicious and vice versa, plus missing values
    flip = rng.random(len(df)) < 0.06
    df.loc[flip, ["followers", "following"]] = df.loc[flip, ["following", "followers"]].to_numpy()
    for col, p in [("has_bio", 0.05), ("activity_level", 0.08), ("has_profile_pic", 0.03)]:
        df.loc[rng.random(len(df)) < p, col] = np.nan
    return df.sample(frac=1, random_state=7).reset_index(drop=True)


if __name__ == "__main__":
    data = make(450, 250)
    data.insert(0, "profile_id", [f"DEMO-{i:04d}" for i in range(len(data))])
    data["is_synthetic_demo"] = True
    (ROOT / "data").mkdir(exist_ok=True)
    data.to_csv(ROOT / "data" / "sample_labeled_dataset.csv", index=False)
    unl = make(6, 4).drop(columns=["label"])
    unl.insert(0, "profile_ref", [f"demo_profile_{i + 1:02d}" for i in range(len(unl))])
    unl.insert(1, "platform", ["Instagram", "X", "Facebook", "LinkedIn", "Instagram", "X", "Other", "Instagram", "X", "Facebook"])
    unl.loc[2, ["followers", "following"]] = [np.nan, np.nan]  # incomplete example
    unl.loc[3, ["has_bio", "verified", "activity_level", "has_profile_pic"]] = np.nan
    unl["is_synthetic_demo"] = True
    unl.to_csv(ROOT / "data" / "sample_profiles.csv", index=False)
    print("wrote", len(data), "labeled rows and", len(unl), "unlabeled rows")
