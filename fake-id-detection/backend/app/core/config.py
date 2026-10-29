"""Application settings loaded from environment variables (see .env.example)."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


class Settings:
    database_url: str = _env("DATABASE_URL", f"sqlite:///{ROOT / 'backend' / 'cybershield.db'}")
    model_dir: Path = Path(_env("MODEL_DIR", str(ROOT / "trained_models")))
    reports_dir: Path = Path(_env("REPORTS_DIR", str(ROOT / "reports")))
    cors_origins: list = [o.strip() for o in _env("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")]
    admin_token: str = _env("ADMIN_TOKEN", "")  # if set, required (X-Admin-Token header) for training endpoints
    max_upload_mb: int = int(_env("MAX_UPLOAD_MB", "5"))
    max_csv_rows: int = int(_env("MAX_CSV_ROWS", "5000"))
    # Configurable DEMONSTRATION thresholds (0-100). Not validated on real-world data.
    low_max: int = int(_env("RISK_LOW_MAX", "34"))
    moderate_max: int = int(_env("RISK_MODERATE_MAX", "64"))
    min_known_fields: int = int(_env("MIN_KNOWN_FIELDS", "4"))
    app_version: str = "1.0.0"


settings = Settings()
settings.model_dir.mkdir(parents=True, exist_ok=True)
settings.reports_dir.mkdir(parents=True, exist_ok=True)
