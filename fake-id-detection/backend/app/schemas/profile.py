"""Pydantic request/response schemas with strict validation."""
import re
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.ml.features import LIMITS

Platform = Literal["Instagram", "Facebook", "X", "LinkedIn", "Other"]
Tri = Literal["yes", "no", "unknown"]
Verified = Literal["verified", "not_verified", "unknown"]
Activity = Literal["low", "medium", "high", "unknown"]
Source = Literal["Publicly available authorized data", "Manually entered data", "Academic dataset", "Other"]
_CTRL = re.compile(r"[\x00-\x1f\x7f<>]")


class ProfileIn(BaseModel):
    platform: Platform
    profile_ref: str = Field(min_length=1, max_length=200)
    account_age_days: Optional[int] = Field(default=None, ge=0, le=LIMITS["account_age_days"])
    followers: Optional[int] = Field(default=None, ge=0, le=LIMITS["followers"])
    following: Optional[int] = Field(default=None, ge=0, le=LIMITS["following"])
    posts: Optional[int] = Field(default=None, ge=0, le=LIMITS["posts"])
    has_profile_pic: Tri = "unknown"
    has_bio: Tri = "unknown"
    verified: Verified = "unknown"
    activity_level: Activity = "unknown"
    data_source: Source = "Manually entered data"
    is_demo: bool = False

    @field_validator("profile_ref")
    @classmethod
    def clean_ref(cls, v: str) -> str:
        v = v.strip()
        if not v or _CTRL.search(v):
            raise ValueError("Profile reference must be non-empty text without control characters or angle brackets.")
        return v

    def features(self) -> dict:
        d = self.model_dump()
        return {k: d[k] for k in ("account_age_days", "followers", "following", "posts", "has_profile_pic",
                                  "has_bio", "verified", "activity_level")}


class AnalyzeRequest(BaseModel):
    profile: ProfileIn
    save: bool = True


class BatchRow(BaseModel):
    row_number: int = Field(ge=1)
    data: dict


class BatchRequest(BaseModel):
    rows: List[BatchRow] = Field(min_length=1)
    save: bool = False
    data_source: Source = "Academic dataset"
    is_demo: bool = False
