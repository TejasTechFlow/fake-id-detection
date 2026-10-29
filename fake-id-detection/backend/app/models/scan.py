"""Scan history table. Stores only the minimum needed: a profile reference, entered feature values and the result.
No passwords, cookies, tokens or private messages are ever stored."""
import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text

from app.database.db import Base


def new_scan_id() -> str:
    return "SCN-" + uuid.uuid4().hex[:8].upper()


class Scan(Base):
    __tablename__ = "scans"
    id = Column(Integer, primary_key=True, autoincrement=True)
    scan_id = Column(String(20), unique=True, index=True, default=new_scan_id, nullable=False)
    profile_ref = Column(String(200), index=True, nullable=False)
    platform = Column(String(20), index=True, nullable=False)
    prediction = Column(String(60), index=True, nullable=False)
    risk_category = Column(String(20), index=True, nullable=False)
    risk_score = Column(Float, nullable=False)
    model_version = Column(String(40), nullable=False)
    data_source = Column(String(60), default="Manually entered data")
    is_demo = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    input_json = Column(Text, nullable=False)
    result_json = Column(Text, nullable=False)

    def summary(self) -> dict:
        return {"scan_id": self.scan_id, "profile_ref": self.profile_ref, "platform": self.platform,
                "prediction": self.prediction, "risk_category": self.risk_category,
                "risk_score": self.risk_score, "model_version": self.model_version, "is_demo": bool(self.is_demo),
                "data_source": self.data_source,
                "created_at": self.created_at.replace(tzinfo=timezone.utc).isoformat() if self.created_at else None}

    def detail(self) -> dict:
        return {**self.summary(), "input": json.loads(self.input_json), "result": json.loads(self.result_json)}
