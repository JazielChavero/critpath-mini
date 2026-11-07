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
}

export const METRICS: MetricDefinition[] = [
  { key: "data_date", label: "Data date", unit: "date",
    formula: "PROJECT.last_recalc_date." },
  { key: "total_activities", label: "Activities", unit: "count",
    formula: "Count of activities (excludes level-of-effort and WBS-summary)." },
  { key: "completed", label: "Completed", unit: "count",
    formula: "Activities with status completed." },
  { key: "in_progress", label: "In progress", unit: "count",
    formula: "Activities with status in progress." },
  { key: "not_started", label: "Not started", unit: "count",
    formula: "Activities with status not started." },
  { key: "milestones", label: "Milestones", unit: "count",
    formula: "Activities whose type is start or finish milestone." },
  { key: "percent_complete_duration", label: "Duration % complete", unit: "percent",
    formula:
      "Σ done_i / Σ planned_i × 100 over activities with planned duration > 0, where planned_i = planned duration, " +
      "done_i = planned_i if completed, else clamp(planned_i − remaining_i, 0, planned_i). " +
      "Weighted by duration; not P6's cost- or units-based percent." },
  { key: "critical_activities", label: "Critical activities", unit: "count",
    formula:
      "Incomplete activities that P6 would mark critical: total float ≤ PROJECT.critical_drtn_hr_cnt " +
      "(or on the longest path, when the project uses that setting)." },
  { key: "negative_float_activities", label: "Negative float", unit: "count",
    formula: "Incomplete activities with total float < 0 (already late against a constraint)." },
  { key: "late_starts", label: "Late starts", unit: "count",
    formula: "Not-started activities whose baseline start is before the data date." },
  { key: "late_finishes", label: "Late finishes", unit: "count",
    formula: "Incomplete activities whose baseline finish is before the data date." },
  { key: "missing_predecessors", label: "Missing predecessors", unit: "count",
    formula: "Incomplete activities (except start milestones) that no relationship points to." },
  { key: "missing_successors", label: "Missing successors", unit: "count",
    formula: "Incomplete activities (except finish milestones) that point to no other activity." },
  { key: "baseline_finish", label: "Baseline finish", unit: "date",
    formula: "Latest baseline finish (TASK.target_end_date) among activities." },
  { key: "forecast_finish", label: "Forecast finish", unit: "date",
    formula:
      "PROJECT.scd_end_date; if empty, the latest of incomplete activities' early finish and completed activities' actual finish." },
  { key: "finish_variance_days", label: "Finish variance", unit: "days",
    formula: "(forecast finish − baseline finish) in calendar days, 1 decimal. Positive = later than baseline." },
];

export const METRIC_BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<MetricKey, MetricDefinition>;
