"""Scan history CRUD plus dashboard and analytics aggregation. All numbers come from the database."""
import json
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import asc, desc, func, or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.ml.predict import load_metrics
from app.models.scan import Scan


def save_scan(db: Session, profile: dict, features: dict, result: dict) -> Scan:
    scan = Scan(profile_ref=profile["profile_ref"][:200], platform=profile["platform"], prediction=result["prediction"],
                risk_category=result["risk_category"], risk_score=result["risk_score"], model_version=result["model_version"],
                data_source=profile.get("data_source", "Manually entered data"), is_demo=bool(profile.get("is_demo")),
                input_json=json.dumps({**features, "platform": profile["platform"], "profile_ref": profile["profile_ref"]}),
                result_json=json.dumps(result))
    db.add(scan)
    db.commit()
    db.refresh(scan)
    return scan


def _filtered(db: Session, q=None, platform=None, risk=None, prediction=None, date_from=None, date_to=None):
    query = db.query(Scan)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Scan.profile_ref.ilike(like), Scan.scan_id.ilike(like)))
    if platform:
        query = query.filter(Scan.platform == platform)
    if risk:
        query = query.filter(Scan.risk_category == risk)
    if prediction:
        query = query.filter(Scan.prediction == prediction)
    if date_from:
        query = query.filter(Scan.created_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc))
    if date_to:
        query = query.filter(Scan.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc))
    return query


def list_scans(db: Session, page=1, page_size=10, sort="newest", **filters) -> dict:
    query = _filtered(db, **filters)
    total = query.count()
    order = {"newest": desc(Scan.created_at), "oldest": asc(Scan.created_at), "score_desc": desc(Scan.risk_score),
             "score_asc": asc(Scan.risk_score)}.get(sort, desc(Scan.created_at))
    items = query.order_by(order).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [s.summary() for s in items], "total": total, "page": page, "page_size": page_size}


def get_scan(db: Session, scan_id: str) -> Optional[Scan]:
    return db.query(Scan).filter(Scan.scan_id == scan_id).first()


def delete_scan(db: Session, scan_id: str) -> bool:
    scan = get_scan(db, scan_id)
    if not scan:
        return False
    db.delete(scan)
    db.commit()
    return True


def _dist(scans):
    c = Counter(s.risk_category for s in scans)
    return {"lower": c.get("lower", 0), "moderate": c.get("moderate", 0), "higher": c.get("higher", 0),
            "insufficient": c.get("insufficient", 0)}


def dashboard(db: Session) -> dict:
    scans = db.query(Scan).all()
    total = len(scans)
    dist = _dist(scans)
    scored = [s.risk_score for s in scans if s.risk_category != "insufficient"]
    today = datetime.now(timezone.utc).date()
    daily = Counter(s.created_at.date() for s in scans if s.created_at)
    series = [{"date": (today - timedelta(days=i)).isoformat(), "scans": daily.get(today - timedelta(days=i), 0)}
              for i in range(29, -1, -1)]
    last7 = sum(v for d, v in daily.items() if (today - d).days < 7)
    prev7 = sum(v for d, v in daily.items() if 7 <= (today - d).days < 14)
    metrics = load_metrics()
    return {
        "total": total, "flagged": dist["moderate"] + dist["higher"], "lower_risk": dist["lower"],
        "insufficient": dist["insufficient"],
        "average_score": round(sum(scored) / len(scored), 1) if scored else None,
        "trend_total_pct": round((last7 - prev7) / prev7 * 100, 1) if prev7 else None,
        "daily_scans": series, "risk_distribution": dist,
        "prediction_counts": dict(Counter(s.prediction for s in scans)),
        "feature_importance": (metrics or {}).get("feature_importance", [])[:8],
        "model_available": metrics is not None,
    }


def analytics(db: Session, date_from=None, date_to=None, platform=None, prediction=None) -> dict:
    scans = _filtered(db, platform=platform, prediction=prediction, date_from=date_from, date_to=date_to).all()
    daily, weekly = Counter(), Counter()
    for s in scans:
        d = s.created_at.date()
        daily[d.isoformat()] += 1
        weekly[(d - timedelta(days=d.weekday())).isoformat()] += 1
    bins = [0] * 10
    for s in scans:
        bins[min(int(s.risk_score // 10), 9)] += 1
    metrics = load_metrics() or {}
    return {
        "total": len(scans),
        "daily": [{"date": k, "scans": v} for k, v in sorted(daily.items())],
        "weekly": [{"week_start": k, "scans": v} for k, v in sorted(weekly.items())],
        "prediction_distribution": dict(Counter(s.prediction for s in scans)),
        "platform_distribution": dict(Counter(s.platform for s in scans)),
        "risk_histogram": [{"range": f"{i * 10}-{i * 10 + 10}", "count": c} for i, c in enumerate(bins)],
        "risk_categories": _dist(scans),
        "feature_importance": metrics.get("feature_importance", [])[:10],
        "class_balance": (metrics.get("dataset") or {}).get("class_distribution"),
        "thresholds": {"lower_max": settings.low_max, "moderate_max": settings.moderate_max},
    }
