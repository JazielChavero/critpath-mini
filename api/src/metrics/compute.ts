/**
 * Computes every metric in definitions.ts for one project of one schedule
 * update. A pure function: same input, same output, no database, no AI.
 */
import type { Project, Relationship, Task } from "../xer/schedule.js";
import type { MetricKey } from "./definitions.js";

export type MetricValue = number | string | null;

export interface ActivityRef {
  code: string;
  name: string;
  status: Task["status"];
  totalFloatDays: number | null;
  baselineFinish: string | null;
  earlyFinish: string | null;
}

export interface MetricsResult {
  projectId: string;
  projectName: string;
  /** Project planned start (for the timeline; not a metric). */
  plannedStart: string | null;
  values: Record<MetricKey, MetricValue>;
  /** Used to convert float from hours to days. */
  hoursPerDay: number;
  /** True when the file did not say and 8 h/day was assumed. */
  hoursPerDayAssumed: boolean;
  /** Up to 15 critical activities, lowest float first (for the dashboard). */
  topCritical: ActivityRef[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function maxDate(dates: (string | null)[]): string | null {
  let max: string | null = null;
  // ISO strings of the same format sort chronologically as text.
  for (const d of dates) if (d && (max === null || d > max)) max = d;
  return max;
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}Z`) - Date.parse(`${from}Z`)) / 86_400_000;
}

export function computeMetrics(project: Project, allTasks: Task[], relationships: Relationship[]): MetricsResult {
  const tasks = allTasks.filter(
    (t) => t.projectId === project.id && t.type !== "level_of_effort" && t.type !== "wbs_summary",
  );
  const incomplete = tasks.filter((t) => t.status !== "completed");
  const hoursPerDay = project.calendarHoursPerDay ?? 8;
  const dataDate = project.dataDate;

  // Duration-weighted percent complete.
  let planned = 0;
  let done = 0;
  for (const t of tasks) {
    const p = t.plannedDurationHrs ?? 0;
    if (p <= 0) continue;
    planned += p;
    if (t.status === "completed") done += p;
    else done += Math.min(p, Math.max(0, p - (t.remainingDurationHrs ?? p)));
  }

  const isCritical = (t: Task) =>
    project.criticalPathType === "longest_path"
      ? t.onDrivingPath
      : t.totalFloatHrs !== null && t.totalFloatHrs <= project.criticalFloatHrs;
  const critical = incomplete.filter(isCritical);

  // Relationship ends, only among this project's activities.
  const ids = new Set(tasks.map((t) => t.id));
  const hasPred = new Set<string>();
  const hasSucc = new Set<string>();
  for (const r of relationships) {
    if (ids.has(r.successorId) && ids.has(r.predecessorId)) {
      hasPred.add(r.successorId);
      hasSucc.add(r.predecessorId);
    }
  }

  const baselineFinish = maxDate(tasks.map((t) => t.baselineFinish));
  const forecastFinish =
    project.scheduledFinish ??
    maxDate([
      ...incomplete.map((t) => t.earlyFinish),
      ...tasks.filter((t) => t.status === "completed").map((t) => t.actualFinish),
    ]);

  const values: Record<MetricKey, MetricValue> = {
    data_date: dataDate,
    total_activities: tasks.length,
    completed: tasks.filter((t) => t.status === "completed").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    not_started: tasks.filter((t) => t.status === "not_started").length,
    milestones: tasks.filter((t) => t.type === "start_milestone" || t.type === "finish_milestone").length,
    percent_complete_duration: planned > 0 ? round1((done / planned) * 100) : null,
    critical_activities: critical.length,
    negative_float_activities: incomplete.filter((t) => t.totalFloatHrs !== null && t.totalFloatHrs < 0).length,
    late_starts: dataDate
      ? tasks.filter((t) => t.status === "not_started" && t.baselineStart !== null && t.baselineStart < dataDate).length
      : null,
    late_finishes: dataDate
      ? incomplete.filter((t) => t.baselineFinish !== null && t.baselineFinish < dataDate).length
      : null,
    missing_predecessors: incomplete.filter((t) => t.type !== "start_milestone" && !hasPred.has(t.id)).length,
    missing_successors: incomplete.filter((t) => t.type !== "finish_milestone" && !hasSucc.has(t.id)).length,
    baseline_finish: baselineFinish,
    forecast_finish: forecastFinish,
    finish_variance_days:
      baselineFinish && forecastFinish ? round1(daysBetween(baselineFinish, forecastFinish)) : null,
  };

  const topCritical = [...critical]
    .sort(
      (a, b) =>
        (a.totalFloatHrs ?? 0) - (b.totalFloatHrs ?? 0) ||
        (a.earlyFinish ?? "").localeCompare(b.earlyFinish ?? "") ||
        a.code.localeCompare(b.code),
    )
    .slice(0, 15)
    .map((t) => ({
      code: t.code,
      name: t.name,
      status: t.status,
      totalFloatDays: t.totalFloatHrs === null ? null : round1(t.totalFloatHrs / hoursPerDay),
      baselineFinish: t.baselineFinish,
      earlyFinish: t.earlyFinish,
    }));

  return {
    projectId: project.id,
    projectName: project.shortName,
    plannedStart: project.plannedStart,
    values,
    hoursPerDay,
    hoursPerDayAssumed: project.calendarHoursPerDay === null,
    topCritical,
  };
}
