"""
Deterministic summary used when no model is configured or every draft was
rejected. It is written with the same placeholders, so it goes through the
same validator and renderer as a model's draft.
"""
from __future__ import annotations

from .facts import Fact


def template_summary(facts: dict[str, Fact], lang: str) -> str:
    has = facts.__contains__
    es = lang == "es"
    s: list[str] = []

    if has("forecast_finish"):
        if has("finish_status"):
            s.append(
                "{{project_name}} se pronostica terminar el {{forecast_finish}}, {{finish_status}}."
                if es else "{{project_name}} is forecast to finish on {{forecast_finish}}, {{finish_status}}."
            )
        else:
            s.append("{{project_name}} se pronostica terminar el {{forecast_finish}}." if es
                     else "{{project_name}} is forecast to finish on {{forecast_finish}}.")

    if has("data_date") and has("percent_complete_duration"):
        s.append(
            "A la fecha de corte del {{data_date}} lleva {{percent_complete_duration}} de avance por duración: "
            "{{completed}} actividades terminadas, {{in_progress}} en progreso y {{not_started}} sin iniciar."
            if es else
            "As of the {{data_date}} data date it is {{percent_complete_duration}} complete by duration: "
            "{{completed}} activities completed, {{in_progress}} in progress and {{not_started}} not started."
        )

    if has("critical_activities"):
        s.append(
            "Hay {{critical_activities}} actividades críticas, {{negative_float_activities}} con holgura negativa, "
            "{{late_starts}} inicios atrasados y {{late_finishes}} terminaciones atrasadas."
            if es else
            "There are {{critical_activities}} critical activities, {{negative_float_activities}} with negative float, "
            "{{late_starts}} late starts and {{late_finishes}} late finishes."
        )

    if has("critical_1"):
        if has("critical_1_finish"):
            s.append("La actividad crítica con menor holgura es {{critical_1}}, con fin temprano el {{critical_1_finish}}."
                     if es else "The critical activity with the lowest float is {{critical_1}}, with an early finish on {{critical_1_finish}}.")
        else:
            s.append("La actividad crítica con menor holgura es {{critical_1}}." if es
                     else "The critical activity with the lowest float is {{critical_1}}.")

    if has("missing_predecessors") and has("missing_successors"):
        s.append(
            "En la lógica, {{missing_predecessors}} actividades no tienen predecesora y {{missing_successors}} no tienen sucesora."
            if es else
            "In the logic, {{missing_predecessors}} activities have no predecessor and {{missing_successors}} have no successor."
        )

    # Drop any sentence that refers to a fact this project does not have.
    from .validate import PLACEHOLDER

    return " ".join(x for x in s if all(k in facts for k in PLACEHOLDER.findall(x)))
