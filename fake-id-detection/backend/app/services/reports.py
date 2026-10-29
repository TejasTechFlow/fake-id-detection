"""PDF and CSV reports generated from stored analysis results (never from placeholder text)."""
import csv
import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.config import settings
from app.ml.predict import DISCLAIMER

CATEGORY_TEXT = {"lower": "Lower Risk", "moderate": "Moderate Risk", "higher": "Higher Risk", "insufficient": "Insufficient Information"}


def _esc(s) -> str:
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def scan_csv(detail: dict) -> bytes:
    res = detail["result"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["scan_id", "profile_ref", "platform", "prediction", "risk_category", "risk_score", "score_type",
                "model_version", "scan_time", "top_factors", "warnings"])
    w.writerow([detail["scan_id"], detail["profile_ref"], detail["platform"], detail["prediction"],
                CATEGORY_TEXT.get(detail["risk_category"], detail["risk_category"]), detail["risk_score"], res.get("score_type"),
                detail["model_version"], detail["created_at"],
                " | ".join(f"{f['label']} ({f['impact']:+})" for f in res["contributing_factors"]),
                " | ".join(res["warnings"])])
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


def scan_pdf(detail: dict) -> bytes:
    res, inp = detail["result"], detail["input"]
    st = getSampleStyleSheet()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                            title=f"CyberShield AI report {detail['scan_id']}")
    story = [Paragraph("CyberShield AI - Profile Risk Assessment", st["Title"]),
             Paragraph(f"Scan {_esc(detail['scan_id'])} | {_esc(detail['created_at'])}", st["Normal"]), Spacer(1, 8)]
    head = [["Profile reference", detail["profile_ref"]], ["Platform", detail["platform"]],
            ["Prediction", detail["prediction"]], ["Risk category", CATEGORY_TEXT.get(detail["risk_category"])],
            ["Risk score (0-100)", f"{detail['risk_score']}  ({res.get('score_type')})"],
            ["Model", f"{res.get('model_name')} / {detail['model_version']}"], ["Data source", detail.get("data_source")]]
    t = Table([[Paragraph(_esc(a), st["Normal"]), Paragraph(_esc(b), st["Normal"])] for a, b in head], colWidths=[50 * mm, 120 * mm])
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.lightgrey), ("BACKGROUND", (0, 0), (0, -1), colors.whitesmoke)]))
    story += [t, Spacer(1, 10), Paragraph("Provided profile data", st["Heading2"])]
    rows = [["Field", "Value"]] + [[k.replace("_", " "), "not provided" if v in (None, "unknown") else v] for k, v in inp.items()
                                    if k not in ("profile_ref", "platform")]
    t2 = Table([[Paragraph(_esc(a), st["Normal"]), Paragraph(_esc(b), st["Normal"])] for a, b in rows], colWidths=[60 * mm, 110 * mm])
    t2.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.lightgrey), ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke)]))
    story += [t2, Spacer(1, 10), Paragraph("Contributing factors", st["Heading2"])]
    if res["contributing_factors"]:
        for f in res["contributing_factors"]:
            story.append(Paragraph(f"&bull; {_esc(f['explanation'])} (impact {f['impact']:+} points)", st["Normal"]))
    else:
        story.append(Paragraph("No single field changed the score noticeably.", st["Normal"]))
    story += [Spacer(1, 8), Paragraph("Warnings", st["Heading2"])]
    for w in res["warnings"] or ["None."]:
        story.append(Paragraph(f"&bull; {_esc(w)}", st["Normal"]))
    story += [Spacer(1, 8), Paragraph("What a reviewer should verify next", st["Heading2"])]
    for v in res["what_to_verify"]:
        story.append(Paragraph(f"&bull; {_esc(v)}", st["Normal"]))
    story += [Spacer(1, 10), Paragraph(
        f"Risk bands (demonstration thresholds, not validated on real-world data): Lower 0-{settings.low_max}, "
        f"Moderate {settings.low_max + 1}-{settings.moderate_max}, Higher {settings.moderate_max + 1}-100.", st["Italic"]),
        Spacer(1, 4), Paragraph(_esc(DISCLAIMER), st["Italic"])]
    doc.build(story)
    return buf.getvalue()
