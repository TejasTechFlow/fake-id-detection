"""Batch analysis: validate every row, report failures by row number (never skip silently), then predict."""
from pydantic import ValidationError

from app.core.config import settings
from app.ml.predict import load_artifact, predict_profiles
from app.schemas.profile import BatchRow, ProfileIn
from app.services import history


def _clean(v):
    return None if v is None or (isinstance(v, str) and v.strip() == "") else v


def run_batch(db, rows: list, save: bool, data_source: str, is_demo: bool) -> dict:
    if len(rows) > settings.max_csv_rows:
        raise ValueError(f"Too many rows ({len(rows)}). The limit is {settings.max_csv_rows}.")
    art = load_artifact()
    valid, errors = [], []
    for r in rows:
        data = {k: _clean(v) for k, v in r.data.items()}
        data.setdefault("platform", "Other")
        data.setdefault("profile_ref", f"row-{r.row_number}")
        data["data_source"], data["is_demo"] = data_source, is_demo
        try:
            valid.append((r.row_number, ProfileIn(**data)))
        except ValidationError as e:
            reasons = "; ".join(f"{'.'.join(str(x) for x in err['loc'])}: {err['msg']}" for err in e.errors())
            errors.append({"row_number": r.row_number, "reason": reasons})
    results = []
    if valid:
        preds = predict_profiles([p.features() for _, p in valid], art)
        for (rn, prof), pred in zip(valid, preds):
            scan_id = None
            if save:
                scan_id = history.save_scan(db, prof.model_dump(), prof.features(), pred).scan_id
            results.append({"row_number": rn, "scan_id": scan_id, "profile_ref": prof.profile_ref, "platform": prof.platform,
                            "prediction": pred["prediction"], "risk_category": pred["risk_category"],
                            "risk_score": pred["risk_score"], "top_factor": (pred["contributing_factors"] or [{}])[0].get("label")})
    cats = {c: sum(1 for r in results if r["risk_category"] == c) for c in ("lower", "moderate", "higher", "insufficient")}
    return {"total_rows": len(rows), "analyzed": len(results), "errors": errors, "error_count": len(errors),
            "counts": cats, "results": results, "model_version": art["version"]}
