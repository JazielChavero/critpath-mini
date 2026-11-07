from app.facts import build_facts, finish_status
from app.models import ProjectIn


def test_values_are_formatted_like_the_dashboard(rehab):
    f = build_facts(rehab, "en")
    assert f["total_activities"].text == "6,977"
    assert f["percent_complete_duration"].text == "28.7%"
    assert f["forecast_finish"].text == "1 May 2010"
    assert f["data_date"].text == "27 May 2008"
    assert f["critical_1"].text == "V3216095 (Screed under upper slabs)"
    assert f["critical_1_finish"].text == "29 May 2008"


def test_spanish_dates_and_phrases(rehab):
    f = build_facts(rehab, "es")
    assert f["forecast_finish"].text == "1 may 2010"
    assert f["finish_status"].text == "0.6 días antes de la línea base"


def test_direction_of_the_finish_is_decided_by_code():
    assert finish_status(3.5, "en") == "3.5 days behind the baseline"
    assert finish_status(-1, "en") == "1.0 day ahead of the baseline"
    assert finish_status(0, "en") == "exactly on the baseline"
    assert finish_status(2, "es") == "2.0 días después de la línea base"


def test_missing_values_are_not_facts():
    p = ProjectIn(projectName="X", values={"forecast_finish": None, "critical_activities": 4})
    f = build_facts(p, "en")
    assert "forecast_finish" not in f and "finish_status" not in f
    assert f["critical_activities"].text == "4"
