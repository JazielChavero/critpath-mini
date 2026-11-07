/**
 * The formula table. Every number the product shows (and every number the AI
 * summary is allowed to mention) is one of these, computed in compute.ts.
 *
 * Shared terms:
 * - "activities": all TASK rows except level-of-effort and WBS-summary
 *   activities (they do not represent real work on the schedule).
 * - "incomplete": status is not started or in progress.
 * - "data date": PROJECT.last_recalc_date, the moment progress was reported.
 */
export type MetricKey =
  | "data_date"
  | "total_activities"
  | "completed"
  | "in_progress"
  | "not_started"
  | "milestones"
  | "percent_complete_duration"
  | "critical_activities"
  | "negative_float_activities"
  | "late_starts"
  | "late_finishes"
  | "missing_predecessors"
  | "missing_successors"
  | "baseline_finish"
  | "forecast_finish"
  | "finish_variance_days";

export type MetricUnit = "count" | "percent" | "date" | "days";

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  unit: MetricUnit;
  formula: string;
  /** Spanish label and formula, kept next to the English ones so they never drift apart. */
  es: { label: string; formula: string };
}

export const METRICS: MetricDefinition[] = [
  {
    key: "data_date", label: "Data date", unit: "date",
    formula: "PROJECT.last_recalc_date.",
    es: { label: "Fecha de corte", formula: "PROJECT.last_recalc_date." },
  },
  {
    key: "total_activities", label: "Activities", unit: "count",
    formula: "Count of activities (excludes level-of-effort and WBS-summary).",
    es: { label: "Actividades", formula: "Número de actividades (sin nivel de esfuerzo ni resúmenes de WBS)." },
  },
  {
    key: "completed", label: "Completed", unit: "count",
    formula: "Activities with status completed.",
    es: { label: "Terminadas", formula: "Actividades con estado terminado." },
  },
  {
    key: "in_progress", label: "In progress", unit: "count",
    formula: "Activities with status in progress.",
    es: { label: "En progreso", formula: "Actividades con estado en progreso." },
  },
  {
    key: "not_started", label: "Not started", unit: "count",
    formula: "Activities with status not started.",
    es: { label: "Sin iniciar", formula: "Actividades con estado sin iniciar." },
  },
  {
    key: "milestones", label: "Milestones", unit: "count",
    formula: "Activities whose type is start or finish milestone.",
    es: { label: "Hitos", formula: "Actividades de tipo hito de inicio o hito de fin." },
  },
  {
    key: "percent_complete_duration", label: "Duration % complete", unit: "percent",
    formula:
      "Σ done_i / Σ planned_i × 100 over activities with planned duration > 0, where planned_i = planned duration, " +
      "done_i = planned_i if completed, else clamp(planned_i − remaining_i, 0, planned_i). " +
      "Weighted by duration; not P6's cost- or units-based percent.",
    es: {
      label: "Avance por duración",
      formula:
        "Σ hecho_i / Σ planeado_i × 100 sobre las actividades con duración planeada > 0, donde planeado_i = duración planeada, " +
        "hecho_i = planeado_i si está terminada; si no, limitar(planeado_i − restante_i, 0, planeado_i). " +
        "Ponderado por duración; no es el porcentaje por costo o por unidades de P6.",
    },
  },
  {
    key: "critical_activities", label: "Critical activities", unit: "count",
    formula:
      "Incomplete activities that P6 would mark critical: total float ≤ PROJECT.critical_drtn_hr_cnt " +
      "(or on the longest path, when the project uses that setting).",
    es: {
      label: "Actividades críticas",
      formula:
        "Actividades sin terminar que P6 marcaría como críticas: holgura total ≤ PROJECT.critical_drtn_hr_cnt " +
        "(o en la ruta más larga, si el proyecto usa esa opción).",
    },
  },
  {
    key: "negative_float_activities", label: "Negative float", unit: "count",
    formula: "Incomplete activities with total float < 0 (already late against a constraint).",
    es: { label: "Holgura negativa", formula: "Actividades sin terminar con holgura total < 0 (ya atrasadas contra una restricción)." },
  },
  {
    key: "late_starts", label: "Late starts", unit: "count",
    formula: "Not-started activities whose baseline start is before the data date.",
    es: { label: "Inicios atrasados", formula: "Actividades sin iniciar cuyo inicio de línea base es anterior a la fecha de corte." },
  },
  {
    key: "late_finishes", label: "Late finishes", unit: "count",
    formula: "Incomplete activities whose baseline finish is before the data date.",
    es: { label: "Terminaciones atrasadas", formula: "Actividades sin terminar cuyo fin de línea base es anterior a la fecha de corte." },
  },
  {
    key: "missing_predecessors", label: "Missing predecessors", unit: "count",
    formula: "Incomplete activities (except start milestones) that no relationship points to.",
    es: { label: "Sin predecesora", formula: "Actividades sin terminar (excepto hitos de inicio) a las que no llega ninguna relación." },
  },
  {
    key: "missing_successors", label: "Missing successors", unit: "count",
    formula: "Incomplete activities (except finish milestones) that point to no other activity.",
    es: { label: "Sin sucesora", formula: "Actividades sin terminar (excepto hitos de fin) de las que no sale ninguna relación." },
  },
  {
    key: "baseline_finish", label: "Baseline finish", unit: "date",
    formula: "Latest baseline finish (TASK.target_end_date) among activities.",
    es: { label: "Fin de línea base", formula: "El fin de línea base más tardío (TASK.target_end_date) entre las actividades." },
  },
  {
    key: "forecast_finish", label: "Forecast finish", unit: "date",
    formula:
      "PROJECT.scd_end_date; if empty, the latest of incomplete activities' early finish and completed activities' actual finish.",
    es: {
      label: "Fin pronosticado",
      formula:
        "PROJECT.scd_end_date; si está vacío, lo más tardío entre el fin temprano de las actividades sin terminar y el fin real de las terminadas.",
    },
  },
  {
    key: "finish_variance_days", label: "Finish variance", unit: "days",
    formula: "(forecast finish − baseline finish) in calendar days, 1 decimal. Positive = later than baseline.",
    es: {
      label: "Variación del fin",
      formula: "(fin pronosticado − fin de línea base) en días naturales, 1 decimal. Positivo = después de la línea base.",
    },
  },
];

export const METRIC_BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<MetricKey, MetricDefinition>;
