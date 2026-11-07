import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import ProjectIn  # noqa: E402

# The real metrics of rehab-2.xer, as returned by the Node API (golden values).
REHAB = {
    "projectName": "R111",
    "plannedStart": "2006-11-07T08:00:00",
    "values": {
        "data_date": "2008-05-27T00:00:00", "total_activities": 6977, "completed": 2037, "in_progress": 176,
        "not_started": 4764, "milestones": 3, "percent_complete_duration": 28.7, "critical_activities": 253,
        "negative_float_activities": 0, "late_starts": 0, "late_finishes": 122, "missing_predecessors": 0,
        "missing_successors": 10, "baseline_finish": "2010-05-02T08:01:00", "forecast_finish": "2010-05-01T17:00:00",
        "finish_variance_days": -0.6,
    },
    "hoursPerDay": 8,
    "hoursPerDayAssumed": True,
    "topCritical": [
        {"code": "V3216095", "name": "Screed under upper slabs", "status": "not_started", "totalFloatDays": 0,
         "baselineFinish": "2008-05-29T17:00:00", "earlyFinish": "2008-05-29T17:00:00"},
        {"code": "V3162105", "name": "Upper slab concrete", "status": "not_started", "totalFloatDays": 0,
         "baselineFinish": "2008-06-03T17:00:00", "earlyFinish": "2008-06-03T17:00:00"},
    ],
}


@pytest.fixture
def rehab() -> ProjectIn:
    return ProjectIn(**REHAB)


class FakeWriter:
    """Returns prepared drafts in order and records what it was sent."""

    model = "fake-model"

    def __init__(self, *drafts: str | Exception):
        self.drafts = list(drafts)
        self.calls: list[list[dict]] = []

    def write(self, system: str, messages: list[dict]) -> str:
        self.calls.append([dict(m) for m in messages])
        d = self.drafts.pop(0)
        if isinstance(d, Exception):
            raise d
        return d
