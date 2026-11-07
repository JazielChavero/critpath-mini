"""
Facts: every value the summary is allowed to mention, already formatted.

The model never sees a bare number it could copy or change. It sees named
placeholders like {{critical_activities}}; this module decides the exact text
each placeholder becomes, using the same formatting as the dashboard.

Phrases whose direction matters (ahead/behind the baseline) are also built
here, so the model cannot get the direction wrong.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .models import ProjectIn

Lang = Literal["en", "es"]

MONTHS = {
    "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    "es": ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
}


@dataclass(frozen=True)
class Fact:
    key: str
    text: str  # what the placeholder becomes in the summary
    label: str  # what it is (shown to the model and on hover in the dashboard)


def fmt_date(iso: str, lang: Lang) -> str:
    y, m, d = (int(x) for x in iso[:10].split("-"))
    return f"{d} {MONTHS[lang][m - 1]} {y}"


def fmt_int(n: float) -> str:
    # en-US and es-MX both group thousands with a comma.
    return f"{int(round(n)):,}"


def fmt_one(n: float) -> str:
    return f"{n:.1f}"


# metric key -> (English label, Spanish label, kind)
METRIC_FACTS: dict[str, tuple[str, str, str]] = {
    "data_date": ("data date (progress reported up to this day)", "fecha de corte (avance reportado hasta este día)", "date"),
    "total_activities": ("number of activities", "número de actividades", "int"),
    "completed": ("completed activities", "actividades terminadas", "int"),
    "in_progress": ("activities in progress", "actividades en progreso", "int"),
    "not_started": ("activities not started", "actividades sin iniciar", "int"),
    "percent_complete_duration": ("percent complete, weighted by planned duration", "porcentaje de avance ponderado por duración", "percent"),
    "critical_activities": ("incomplete activities that are critical", "actividades sin terminar que son críticas", "int"),
    "negative_float_activities": ("incomplete activities with negative float", "actividades sin terminar con holgura negativa", "int"),
    "late_starts": ("activities that should have started by the data date but have not", "actividades que debían haber iniciado a la fecha de corte y no lo han hecho", "int"),
    "late_finishes": ("incomplete activities whose baseline finish is before the data date", "actividades sin terminar cuyo fin de línea base ya pasó", "int"),
    "missing_predecessors": ("incomplete activities with no predecessor", "actividades sin terminar sin predecesora", "int"),
    "missing_successors": ("incomplete activities with no successor", "actividades sin terminar sin sucesora", "int"),
    "baseline_finish": ("baseline finish date", "fecha de fin de línea base", "date"),
    "forecast_finish": ("forecast finish date", "fecha de fin pronosticada", "date"),
}


def finish_status(variance: float, lang: Lang) -> str:
    days = fmt_one(abs(variance))
    if lang == "es":
        unit = "día" if abs(variance) == 1 else "días"
        if variance > 0:
            return f"{days} {unit} después de la línea base"
        if variance < 0:
            return f"{days} {unit} antes de la línea base"
        return "justo en la línea base"
    unit = "day" if abs(variance) == 1 else "days"
    if variance > 0:
        return f"{days} {unit} behind the baseline"
    if variance < 0:
        return f"{days} {unit} ahead of the baseline"
    return "exactly on the baseline"


def build_facts(project: ProjectIn, lang: Lang) -> dict[str, Fact]:
    es = lang == "es"
    facts: dict[str, Fact] = {}

    def add(key: str, text: str, label: str) -> None:
        facts[key] = Fact(key, text, label)

    add("project_name", project.projectName, "nombre del proyecto" if es else "project name")

    for key, (label_en, label_es, kind) in METRIC_FACTS.items():
        v = project.values.get(key)
        if v is None:
            continue  # a missing value is never mentioned
        if kind == "date":
            text = fmt_date(str(v), lang)
        elif kind == "percent":
            text = f"{fmt_one(float(v))}%"
        else:
            text = fmt_int(float(v))
        add(key, text, label_es if es else label_en)

    variance = project.values.get("finish_variance_days")
    if isinstance(variance, (int, float)):
        add(
            "finish_status",
            finish_status(float(variance), lang),
            "posición del fin pronosticado respecto a la línea base" if es else "forecast finish compared with the baseline",
        )

    for i, a in enumerate(project.topCritical[:3], start=1):
        add(f"critical_{i}", f"{a.code} ({a.name})" if a.name else a.code,
            f"actividad crítica número {i} (menor holgura)" if es else f"critical activity #{i} (lowest float)")
        if a.earlyFinish:
            add(f"critical_{i}_finish", fmt_date(a.earlyFinish, lang),
                f"fin temprano de la actividad crítica {i}" if es else f"early finish of critical activity #{i}")

    return facts
