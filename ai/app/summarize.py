"""
Writes the summary: the model drafts with placeholders, the validator checks
the draft, and only an accepted draft is shown. Up to 3 drafts; if none is
accepted (or there is no model), the deterministic template is used and the
response says so.
"""
from __future__ import annotations

from .facts import Fact, build_facts
from .models import Attempt, ProjectIn, Segment, SummaryResponse
from .template import template_summary
from .validate import render, validate
from .writer import Writer

MAX_DRAFTS = 3

SYSTEM = """You write the monthly schedule summary for a construction project controls team.

You are given FACTS. Each fact has a key, a description and its value. The values were computed by software from the Primavera P6 schedule and are correct.

Rules — a draft that breaks any of them is rejected automatically:
1. Write every number, date, percentage, activity code and project name ONLY as a placeholder: {{key}}. Example: "{{critical_activities}} activities are critical." The software replaces the placeholder with the exact value.
2. Never type a digit. Never write a number as a word ("two", "hundred", "dozen", "half", "dos", "cien", "mitad", ...).
3. Use only the keys listed in FACTS. Do not invent other keys.
4. You must mention the forecast finish with {{forecast_finish}} and, if present, {{finish_status}}. {{finish_status}} already says whether it is ahead of or behind the baseline: do not add your own "ahead", "behind", "early" or "late" about the finish.
5. Only state what the facts say. Do not guess causes, do not give advice, do not describe amounts with vague words such as "most", "many", "few" or "significant".
6. 3 to 5 sentences of plain prose. No headings, no lists, no markdown, no quotation marks around placeholders.
"""


def _facts_block(facts: dict[str, Fact]) -> str:
    return "\n".join(f"{{{{{f.key}}}}} = {f.text}  ({f.label})" for f in facts.values())


def _prompt(facts: dict[str, Fact], lang: str) -> str:
    language = "Spanish (Mexico)" if lang == "es" else "English"
    return (
        f"Write the summary in {language}.\n\nFACTS:\n{_facts_block(facts)}\n\n"
        "Reply with the summary only, using the placeholders."
    )


def _result(draft: str, facts: dict[str, Fact], source: str, attempts: list[Attempt], model: str | None,
            reason: str | None, code: str | None = None):
    text, segments = render(draft.strip(), facts)
    return SummaryResponse(
        text=text,
        segments=[Segment(**s) for s in segments],
        source=source,  # type: ignore[arg-type]
        model=model,
        attempts=attempts,
        reason=reason,
        reasonCode=code,  # type: ignore[arg-type]
    )


def summarize(project: ProjectIn, lang: str, writer: Writer | None) -> SummaryResponse:
    facts = build_facts(project, lang)  # type: ignore[arg-type]
    attempts: list[Attempt] = []

    if writer is None:
        return _fallback(facts, lang, attempts, None, "No language model is configured.", "no_model")

    messages: list[dict] = [{"role": "user", "content": _prompt(facts, lang)}]
    for _ in range(MAX_DRAFTS):
        try:
            draft = writer.write(SYSTEM, messages)
        except Exception as e:  # network, quota, bad key...
            return _fallback(facts, lang, attempts, writer.model, f"The language model could not be reached: {type(e).__name__}.", "model_error")
        check = validate(draft, facts, lang)
        attempts.append(Attempt(ok=check.ok, problems=check.problems))
        if check.ok:
            return _result(draft, facts, "ai", attempts, writer.model, None)
        # Tell the model exactly what was wrong and ask again.
        messages += [
            {"role": "assistant", "content": draft},
            {"role": "user", "content": "That draft was rejected:\n- " + "\n- ".join(check.problems) +
             "\nRewrite the whole summary following every rule."},
        ]

    return _fallback(facts, lang, attempts, writer.model, f"All {MAX_DRAFTS} drafts were rejected by the number check.", "all_rejected")


def _fallback(facts: dict[str, Fact], lang: str, attempts: list[Attempt], model: str | None, reason: str, code: str) -> SummaryResponse:
    draft = template_summary(facts, lang)
    check = validate(draft, facts, lang)
    if not check.ok:  # the template is ours; if it fails, that is a bug to see, not hide
        raise AssertionError("Template summary failed validation: " + "; ".join(check.problems))
    return _result(draft, facts, "template", attempts, model, reason, code)
