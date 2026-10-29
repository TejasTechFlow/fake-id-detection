"""API tests (need fastapi, httpx, sqlalchemy - see requirements.txt)."""
import io

from tests.conftest import GOOD


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok" and r.json()["model_available"] is False


def test_analyze_without_model_returns_409(client):
    r = client.post("/api/analyze", json={"profile": GOOD})
    assert r.status_code == 409 and "No trained model" in r.json()["error"]["message"]


def test_metrics_without_model_returns_404(client):
    assert client.get("/api/model/metrics").status_code == 404


def test_validation_errors(client):
    for bad in ({"followers": -1}, {"posts": "abc"}, {"account_age_days": 10**9}, {"profile_ref": "<script>"}, {"platform": "MySpace"}):
        r = client.post("/api/analyze", json={"profile": {**GOOD, **bad}})
        assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"


def test_train_and_analyze(client, trained):
    assert trained["is_synthetic"] is True
    r = client.post("/api/analyze", json={"profile": GOOD})
    body = r.json()
    assert r.status_code == 200 and body["scan_id"].startswith("SCN-") and 0 <= body["risk_score"] <= 100
    assert "not definitive proof" in body["disclaimer"]


def test_zero_followers_and_zero_age(client, trained):
    r = client.post("/api/analyze", json={"profile": {**GOOD, "followers": 0, "following": 0, "account_age_days": 0, "posts": 0}})
    assert r.status_code == 200


def test_insufficient_information(client, trained):
    r = client.post("/api/analyze", json={"profile": {"platform": "X", "profile_ref": "thin"}, "save": False})
    assert r.json()["prediction"] == "Insufficient Information"


def test_history_crud_and_dashboard(client, trained):
    sid = client.post("/api/analyze", json={"profile": GOOD}).json()["scan_id"]
    h = client.get("/api/history").json()
    assert h["total"] == 1 and h["items"][0]["scan_id"] == sid
    assert client.get(f"/api/history/{sid}").json()["input"]["followers"] == 5
    assert client.get("/api/history?q=nomatch").json()["total"] == 0
    assert client.get("/api/dashboard").json()["total"] == 1
    assert client.get("/api/analytics").json()["total"] == 1
    assert client.delete(f"/api/history/{sid}").status_code == 200
    assert client.get(f"/api/history/{sid}").status_code == 404
    assert client.get("/api/history/not-an-id").status_code == 400


def test_reports(client, trained):
    sid = client.post("/api/analyze", json={"profile": GOOD}).json()["scan_id"]
    pdf = client.get(f"/api/reports/{sid}?format=pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    assert sid in client.get(f"/api/reports/{sid}?format=csv").text


def test_batch_reports_bad_rows(client, trained):
    rows = [{"row_number": 1, "data": {"profile_ref": "a", "platform": "X", "followers": 10, "following": 20, "posts": 3, "account_age_days": 40}},
            {"row_number": 2, "data": {"profile_ref": "b", "platform": "X", "followers": -4}}]
    r = client.post("/api/analyze/batch", json={"rows": rows}).json()
    assert r["analyzed"] == 1 and r["error_count"] == 1 and r["errors"][0]["row_number"] == 2


def test_dataset_validate_errors(client):
    r = client.post("/api/dataset/validate", files={"file": ("x.csv", io.BytesIO(b"a,b\n1,2\n"), "text/csv")}, data={"target": "label"})
    assert r.status_code == 422
    r = client.post("/api/dataset/validate", files={"file": ("x.txt", io.BytesIO(b"hi"), "text/plain")})
    assert r.status_code == 400
    csv = b"account_age_days,followers,following,posts,label\n" + b"\n".join(b"5,1,1,1,fake" for _ in range(30))
    assert client.post("/api/dataset/validate", files={"file": ("x.csv", io.BytesIO(csv), "text/csv")}).status_code == 422
