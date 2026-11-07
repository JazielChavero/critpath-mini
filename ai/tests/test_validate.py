import pytest

from app.facts import build_facts
from app.validate import render, validate

GOOD = (
    "{{project_name}} is forecast to finish on {{forecast_finish}}, {{finish_status}}. "
    "{{critical_activities}} activities are critical and {{late_finishes}} have passed their baseline finish."
)


@pytest.fixture
def facts(rehab):
    return build_facts(rehab, "en")


def test_accepts_a_draft_that_uses_only_placeholders(facts):
    assert validate(GOOD, facts, "en").ok


@pytest.mark.parametrize(
    "bad, problem",
    [
        # The model typed a number itself, even a correct one.
        ("{{project_name}} finishes on {{forecast_finish}}. 253 activities are critical.", "digit"),
        # The model changed a number.
        ("{{project_name}} finishes on {{forecast_finish}}. 254 activities are critical.", "digit"),
        # The model invented a date.
        ("{{project_name}} finishes on May 3, 2010.", "digit"),
        # Numbers as words.
        ("{{project_name}} finishes on {{forecast_finish}}. Over two hundred activities are critical.", "words"),
        ("{{project_name}} finishes on {{forecast_finish}}. About half the work is done.", "words"),
        # An invented metric.
        ("{{project_name}} finishes on {{forecast_finish}} with {{cost_overrun}} over budget.", "not facts"),
        # A broken placeholder.
        ("{{project_name}} finishes on {{forecast_finish}} with {critical_activities} critical.", "broken"),
        # The finish date is not mentioned at all.
        ("{{critical_activities}} activities are critical.", "forecast finish"),
    ],
)
def test_rejects_anything_that_could_carry_an_invented_number(facts, bad, problem):
    v = validate(bad, facts, "en")
    assert not v.ok
    assert any(problem in p for p in v.problems), v.problems


def test_one_as_a_pronoun_is_allowed_but_not_as_a_quantity(facts):
    base = "{{project_name}} is forecast to finish on {{forecast_finish}}, {{finish_status}}. "
    assert validate(base + "The one with the lowest float is {{critical_1}}.", facts, "en").ok
    assert validate(base + "No one activity drives the date.", facts, "en").ok
    v = validate(base + "Only one activity has negative float.", facts, "en")
    assert not v.ok and "one" in v.problems[-1]


def test_spanish_number_words_are_rejected(rehab):
    facts = build_facts(rehab, "es")
    v = validate("{{project_name}} termina el {{forecast_finish}}. Hay doscientas actividades... no: hay cien.", facts, "es")
    assert not v.ok and "cien" in v.problems[-1]


def test_spanish_articles_are_not_mistaken_for_numbers(rehab):
    facts = build_facts(rehab, "es")
    draft = "{{project_name}} se pronostica terminar el {{forecast_finish}}, {{finish_status}}. Una actividad crítica es {{critical_1}}."
    assert validate(draft, facts, "es").ok


def test_render_puts_in_the_computed_values_and_marks_them(facts):
    text, segments = render(GOOD, facts)
    assert text == (
        "R111 is forecast to finish on 1 May 2010, 0.6 days ahead of the baseline. "
        "253 activities are critical and 122 have passed their baseline finish."
    )
    marked = [s for s in segments if "fact" in s]
    assert [s["fact"] for s in marked] == [
        "project_name", "forecast_finish", "finish_status", "critical_activities", "late_finishes",
    ]
    assert marked[3]["text"] == "253"
