"""Request and response shapes of the AI service."""
from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import BaseModel, Field


class ActivityIn(BaseModel):
    code: str
    name: str = ""
    status: str
    totalFloatDays: Optional[float] = None
    baselineFinish: Optional[str] = None
    earlyFinish: Optional[str] = None


class ProjectIn(BaseModel):
    """One project's metrics, exactly as the Node API computes them."""

    projectName: str
    plannedStart: Optional[str] = None
    values: dict[str, Union[float, int, str, None]]
    hoursPerDay: float = 8
    hoursPerDayAssumed: bool = False
    topCritical: list[ActivityIn] = Field(default_factory=list)


class SummaryRequest(BaseModel):
    lang: Literal["en", "es"] = "en"
    project: ProjectIn


class Segment(BaseModel):
    text: str
    fact: Optional[str] = None  # metric key when this piece of text is a computed value
    label: Optional[str] = None


class Attempt(BaseModel):
    ok: bool
    problems: list[str]


class SummaryResponse(BaseModel):
    text: str
    segments: list[Segment]
    source: Literal["ai", "template"]
    model: Optional[str] = None
    attempts: list[Attempt]
    reason: Optional[str] = None  # why the template was used, when it was
    reasonCode: Optional[Literal["no_model", "model_error", "all_rejected"]] = None
