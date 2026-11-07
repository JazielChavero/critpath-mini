import re

from fastapi.testclient import TestClient

from app.facts import build_facts
from app.main import create_app
from app.summarize import MAX_DRAFTS, summarize
from conftest import REHAB, FakeWriter

GOOD = "{{project_name}} is forecast to finish on {{forecast_finish}}, {{finish_status}}. {{critical_activities}} activities are critical."
INVENTS = "{{project_name}} is forecast to finish on {{forecast_finish}}. 300 activities are critical."


def numbers_in(text: str) -> set[str]:
    return set(re.findall(r"\d+(?:[.,]\d+)*", text))


def allowed_numbers(project, lang) -> set[str]:
    """Every number that appears in any computed fact."""
    out: set[str] = set()
    for f in build_facts(project, lang).values():
        out |= numbers_in(f.text)
    return out


def test_accepted_draft_is_returned_as_ai(rehab):
    w = FakeWriter(GOOD)
    r = summarize(rehab, "en", w)
    assert r.source == "ai" and r.model == "fake-model"
    assert r.text.startswith("R111 is forecast to finish on 1 May 2010, 0.6 days ahead")
    assert [a.ok for a in r.attempts] == [True]


def test_rejected_draft_is_retried_with_the_reasons(rehab):
    w = FakeWriter(INVENTS, GOOD)
    r = summarize(rehab, "en", w)
    assert r.source == "ai"
    assert [a.ok for a in r.attempts] == [False, True]
    feedback = w.calls[1][-1]["content"]
    assert "rejected" in feedback and "digit" in feedback


def test_after_too_many_bad_drafts_the_template_is_used(rehab):
    w = FakeWriter(*[INVENTS] * MAX_DRAFTS)
    r = summarize(rehab, "en", w)
    assert r.source == "template"
    assert "rejected" in (r.reason or "")
    assert "300" not in r.text  # the invented number never reaches the user


def test_model_errors_fall_back_to_the_template(rehab):
    r = summarize(rehab, "en", FakeWriter(TimeoutError("slow")))
    assert r.source == "template" and "TimeoutError" in (r.reason or "")


def test_no_model_configured_uses_the_template(rehab):
    r = summarize(rehab, "es", None)
    assert r.source == "template" and r.reasonCode == "no_model"
    assert r.text.startswith("R111 se pronostica terminar el 1 may 2010, 0.6 días antes de la línea base.")


def test_every_number_shown_comes_from_a_computed_fact(rehab):
    for lang in ("en", "es"):
        for writer in (None, FakeWriter(GOOD), FakeWriter(INVENTS, INVENTS, INVENTS)):
            r = summarize(rehab, lang, writer)
            assert numbers_in(r.text) <= allowed_numbers(rehab, lang), (lang, r.text)


def test_template_covers_a_project_with_missing_values():
    from app.models import ProjectIn

    p = ProjectIn(projectName="Bare", values={"forecast_finish": "2025-01-31T17:00:00", "critical_activities": 2})
    r = summarize(p, "en", None)
    assert r.text == "Bare is forecast to finish on 31 Jan 2025."


def test_http_endpoint_and_service_token(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_TOKEN", "s3cret")
    client = TestClient(create_app(writer=FakeWriter(GOOD)))
    assert client.post("/summaries", json={"lang": "en", "project": REHAB}).status_code == 401
    r = client.post("/summaries", json={"lang": "en", "project": REHAB}, headers={"x-service-token": "s3cret"})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "ai"
    assert body["segments"][0] == {"text": "R111", "fact": "project_name", "label": "project name"}
