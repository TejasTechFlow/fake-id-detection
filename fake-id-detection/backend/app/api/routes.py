"""REST endpoints."""
import io
import json
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.config import ROOT, settings
from app.database.db import get_db
from app.ml.features import DatasetError, validate_dataset
from app.ml.predict import ModelNotAvailable, load_artifact, load_metrics, model_available, predict_profiles
from app.ml.train import train_model
from app.schemas.profile import AnalyzeRequest, BatchRequest
from app.services import batch as batch_service
from app.services import history, reports

router = APIRouter(prefix="/api")
SCAN_ID = re.compile(r"^SCN-[A-F0-9]{8}$")
LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost", "testclient"}


def require_admin(request: Request):
    """Training is allowed from localhost, or from anywhere with the correct X-Admin-Token when ADMIN_TOKEN is set."""
    if settings.admin_token:
        if request.headers.get("x-admin-token") != settings.admin_token:
            raise HTTPException(401, "Admin token required for this operation.")
    elif (request.client.host if request.client else "") not in LOCAL_HOSTS:
        raise HTTPException(403, "Training is only available from the local machine unless ADMIN_TOKEN is configured.")


async def _read_csv(file: UploadFile) -> pd.DataFrame:
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(400, "Only .csv files are accepted.")
    raw = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(raw) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File too large. Limit is {settings.max_upload_mb} MB.")
    try:
        df = pd.read_csv(io.BytesIO(raw), nrows=settings.max_csv_rows + 1)
    except Exception:
        raise HTTPException(400, "Could not parse the CSV file. Check that it is a valid, comma-separated file with a header row.")
    if df.empty:
        raise HTTPException(400, "The CSV file contains no rows.")
    if len(df) > settings.max_csv_rows:
        raise HTTPException(413, f"Too many rows. The limit is {settings.max_csv_rows}.")
    return df


def _mapping(text: Optional[str]) -> Optional[dict]:
    if not text:
        return None
    try:
        m = json.loads(text)
        assert isinstance(m, dict)
        return {str(k): str(v) for k, v in m.items()}
    except Exception:
        raise HTTPException(400, "Feature mapping must be a JSON object of canonical_name -> dataset_column.")


@router.get("/health")
def health():
    metrics = load_metrics()
    return {"status": "ok", "version": settings.app_version, "model_available": model_available(),
            "model_version": (metrics or {}).get("model_version"), "is_synthetic_model": bool((metrics or {}).get("is_synthetic")),
            "demo_message": ("Demo mode: A trained model and validated real-world dataset are required for meaningful predictions."
                             if (not metrics or metrics.get("is_synthetic")) else None)}


@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    return history.dashboard(db)


@router.post("/analyze")
def analyze(req: AnalyzeRequest, db: Session = Depends(get_db)):
    try:
        art = load_artifact()
    except ModelNotAvailable as e:
        raise HTTPException(409, str(e))
    prof = req.profile
    result = predict_profiles([prof.features()], art)[0]
    out = {**result, "profile_ref": prof.profile_ref, "platform": prof.platform, "scan_id": None,
           "analyzed_at": datetime.now(timezone.utc).isoformat(), "saved": False,
           "thresholds": {"lower_max": settings.low_max, "moderate_max": settings.moderate_max}}
    if req.save:
        scan = history.save_scan(db, prof.model_dump(), prof.features(), result)
        out.update(scan_id=scan.scan_id, analyzed_at=scan.summary()["created_at"], saved=True)
    return out


@router.post("/analyze/batch")
def analyze_batch(req: BatchRequest, db: Session = Depends(get_db)):
    try:
        return batch_service.run_batch(db, req.rows, req.save, req.data_source, req.is_demo)
    except ModelNotAvailable as e:
        raise HTTPException(409, str(e))
    except ValueError as e:
        raise HTTPException(413, str(e))


@router.post("/dataset/validate")
async def validate(file: UploadFile = File(...), target: str = Form("label"), positive_label: Optional[str] = Form(None),
                   mapping: Optional[str] = Form(None)):
    df = await _read_csv(file)
    try:
        return validate_dataset(df, target, _mapping(mapping), positive_label or None)
    except DatasetError as e:
        raise HTTPException(422, str(e))


@router.post("/model/train", dependencies=[Depends(require_admin)])
async def train(file: Optional[UploadFile] = File(None), use_demo: bool = Form(False), target: str = Form("label"),
                positive_label: Optional[str] = Form(None), mapping: Optional[str] = Form(None),
                group_column: Optional[str] = Form(None), time_column: Optional[str] = Form(None)):
    if use_demo:
        demo = ROOT / "data" / "sample_labeled_dataset.csv"
        if not demo.exists():
            raise HTTPException(404, "Demo dataset not found. Run backend/scripts/generate_demo_data.py.")
        df, name, synthetic = pd.read_csv(demo), "Synthetic demonstration dataset", True
        positive_label, target = "fake", "label"
    elif file is not None:
        df, name, synthetic = await _read_csv(file), file.filename or "uploaded dataset", False
    else:
        raise HTTPException(400, "Upload a labeled CSV file or choose the demonstration dataset.")
    try:
        return train_model(df, target, _mapping(mapping), positive_label or None, group_column or None, time_column or None,
                           dataset_name=name, is_synthetic=synthetic)
    except DatasetError as e:
        raise HTTPException(422, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.get("/model/metrics")
def metrics():
    m = load_metrics()
    if not m:
        raise HTTPException(404, "No trained model found. Upload a labeled dataset and train the model to view performance metrics.")
    return m


@router.get("/history")
def get_history(page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100), q: Optional[str] = Query(None, max_length=100),
                platform: Optional[str] = None, risk: Optional[str] = Query(None, pattern="^(lower|moderate|higher|insufficient)$"),
                sort: str = Query("newest", pattern="^(newest|oldest|score_desc|score_asc)$"), db: Session = Depends(get_db)):
    return history.list_scans(db, page, page_size, sort, q=q, platform=platform, risk=risk)


def _scan_or_404(db: Session, scan_id: str):
    if not SCAN_ID.match(scan_id):
        raise HTTPException(400, "Invalid scan ID format.")
    scan = history.get_scan(db, scan_id)
    if not scan:
        raise HTTPException(404, "Scan not found.")
    return scan


@router.get("/history/{scan_id}")
def get_scan(scan_id: str, db: Session = Depends(get_db)):
    return _scan_or_404(db, scan_id).detail()


@router.delete("/history/{scan_id}")
def delete_scan(scan_id: str, db: Session = Depends(get_db)):
    _scan_or_404(db, scan_id)
    history.delete_scan(db, scan_id)
    return {"deleted": scan_id}


@router.get("/analytics")
def get_analytics(date_from: Optional[date] = None, date_to: Optional[date] = None, platform: Optional[str] = None,
                  prediction: Optional[str] = None, db: Session = Depends(get_db)):
    return history.analytics(db, date_from, date_to, platform, prediction)


@router.get("/reports/{scan_id}")
def get_report(scan_id: str, format: str = Query("pdf", pattern="^(pdf|csv|json)$"), db: Session = Depends(get_db)):
    detail = _scan_or_404(db, scan_id).detail()
    if format == "json":
        return detail
    if format == "csv":
        return Response(reports.scan_csv(detail), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="{scan_id}.csv"'})
    return Response(reports.scan_pdf(detail), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{scan_id}.pdf"'})
