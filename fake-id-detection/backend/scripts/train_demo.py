"""Train a model from the SYNTHETIC demo dataset so the interface can be explored (no real-world capability)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pandas as pd  # noqa: E402

from app.ml.train import train_model  # noqa: E402

root = Path(__file__).resolve().parents[2]
m = train_model(pd.read_csv(root / "data" / "sample_labeled_dataset.csv"), "label", positive_label="fake",
                dataset_name="Synthetic demonstration dataset", is_synthetic=True)
print(f"Trained {m['selected_model']} ({m['model_version']}). Test ROC-AUC on SYNTHETIC data: {m['test']['roc_auc']:.3f}")
