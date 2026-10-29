import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="cybershield-test-"))
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp / 'test.db'}"
os.environ["MODEL_DIR"] = str(_tmp / "models")
os.environ["REPORTS_DIR"] = str(_tmp / "reports")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.database.db import Base, engine  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    for f in (_tmp / "models").glob("*"):
        f.unlink()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def trained(client):
    r = client.post("/api/model/train", data={"use_demo": "true"})
    assert r.status_code == 200, r.text
    return r.json()


GOOD = {"platform": "Instagram", "profile_ref": "demo_user", "account_age_days": 30, "followers": 5, "following": 800,
        "posts": 2, "has_profile_pic": "no", "has_bio": "no", "verified": "not_verified", "activity_level": "high",
        "data_source": "Manually entered data", "is_demo": True}
