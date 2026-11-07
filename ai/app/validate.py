"""
The guard between the model and the user.

The model must write every number through a placeholder ({{fact_key}}).
A draft is rejected when, outside the placeholders, it contains:
  - any digit (a number it typed itself),
  - a number written as a word ("two hundred", "doscientos", "a dozen"),
  - a placeholder that is not one of the facts (an invented metric),
  - stray braces (a broken placeholder).
It must also mention the forecast finish, the one thing every reader needs.

Because every number in the final text is put there by our code, a summary
that passes this check cannot contain a number we did not compute.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .facts import Fact

PLACEHOLDER = re.compile(r"\{\{\s*([a-z0-9_]+)\s*\}\}")
DIGIT = re.compile(r"\d")

# Numbers written out. Spanish "un/una" are left out on purpose: they are also
# the indefinite article ("una actividad"), so banning them would block normal text.
NUMBER_WORDS = {
    "en": (
        "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen "
        "seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred hundreds "
        "thousand thousands million millions dozen dozens half quarter percent single double triple couple"
    ),
    "es": (
        "cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis "
        "diecisiete dieciocho diecinueve veinte treinta cuarenta cincuenta sesenta setenta ochenta noventa "
        "cien ciento cientos doscientos doscientas trescientos trescientas cuatrocientos cuatrocientas quinientos quinientas "
        "seiscientos seiscientas setecientos setecientas ochocientos ochocientas "
        "novecientos novecientas mil miles millón millones docena docenas mitad tercio porciento par"
    ),
}
_WORD_RE = {
    lang: re.compile(r"\b(" + "|".join(sorted(words.split(), key=len, reverse=True)) + r")\b", re.IGNORECASE)
    for lang, words in NUMBER_WORDS.items()
}

# "one" as a pronoun is not a quantity ("the one with the lowest float", "no one").
# Those phrases are removed before the number-word check; "one activity" still fails.
PRONOUN_ONE = re.compile(r"\b(the|this|that|which|each|no|any|every|some)\s+one\b", re.IGNORECASE)

MAX_CHARS = 1500


@dataclass
class Validation:
    ok: bool
    problems: list[str] = field(default_factory=list)


def validate(draft: str, facts: dict[str, Fact], lang: str) -> Validation:
    problems: list[str] = []
    text = draft.strip()
    if not text:
        return Validation(False, ["The summary is empty."])
    if len(text) > MAX_CHARS:
        problems.append(f"The summary is too long ({len(text)} characters, max {MAX_CHARS}).")

    keys = PLACEHOLDER.findall(text)
    unknown = sorted({k for k in keys if k not in facts})
    if unknown:
        problems.append("These placeholders are not facts you were given: " + ", ".join("{{" + k + "}}" for k in unknown) + ".")

    outside = PLACEHOLDER.sub(" ", text)
    for m in DIGIT.finditer(outside):
        snippet = outside[max(0, m.start() - 15) : m.end() + 15].strip()
        problems.append(f'A digit was written directly instead of through a placeholder: "…{snippet}…".')
        break  # one example is enough feedback
    scan = PRONOUN_ONE.sub(" ", outside) if lang == "en" else outside
    words = sorted({w.lower() for w in _WORD_RE[lang].findall(scan)})
    if words:
        problems.append("Numbers were written as words: " + ", ".join(words) + ". Use the placeholders instead.")
    if "{" in outside or "}" in outside:
        problems.append("There is a broken placeholder (stray { or }). Use the exact form {{key}}.")

    if "forecast_finish" in facts and "forecast_finish" not in keys and "finish_status" not in keys:
        problems.append("The summary must mention the forecast finish ({{forecast_finish}} or {{finish_status}}).")

    return Validation(not problems, problems)


def render(draft: str, facts: dict[str, Fact]) -> tuple[str, list[dict]]:
    """Replaces placeholders with the computed text. Returns the plain text and
    segments that tell the dashboard which pieces are computed values."""
    segments: list[dict] = []
    pos = 0
    for m in PLACEHOLDER.finditer(draft):
        if m.start() > pos:
            segments.append({"text": draft[pos : m.start()]})
        f = facts[m.group(1)]
        segments.append({"text": f.text, "fact": f.key, "label": f.label})
        pos = m.end()
    if pos < len(draft):
        segments.append({"text": draft[pos:]})
    # Collapse whitespace the model may leave around line breaks.
    plain = "".join(s["text"] for s in segments).strip()
    return plain, segments
