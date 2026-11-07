import { useState } from "react";
import type { Issue, MetricsResponse, ProjectMetrics } from "../api";
import { fmtDate, fmtInt } from "../format";
import { CriticalTable } from "./CriticalTable";
import { IssueList } from "./IssueList";
import { MetricRows } from "./MetricRows";
import { ProgressBar } from "./ProgressBar";
import { Timeline } from "./Timeline";

const n = (v: unknown) => (typeof v === "number" ? v : 0);
const s = (v: unknown) => (typeof v === "string" ? v : null);

/** One plain sentence about the finish date, built only from computed values. */
function verdict(p: ProjectMetrics): string {
  const forecast = s(p.values.forecast_finish);
  const variance = p.values.finish_variance_days;
  if (!forecast) return "The file has no forecast finish date.";
  if (typeof variance !== "number") return `Forecast to finish on ${fmtDate(forecast)}.`;
  const days = Math.abs(variance).toFixed(1);
  if (variance > 0) return `Forecast to finish on ${fmtDate(forecast)}, ${days} days after the baseline.`;
  if (variance < 0) return `Forecast to finish on ${fmtDate(forecast)}, ${days} days ahead of the baseline.`;
  return `Forecast to finish on ${fmtDate(forecast)}, exactly on the baseline.`;
}

interface Props {
  data: MetricsResponse;
  warnings: Issue[];
}

export function Dashboard({ data, warnings }: Props) {
  const [projectIdx, setProjectIdx] = useState(0);
  const p = data.projects[projectIdx] ?? data.projects[0];
  if (!p) return <p className="empty">This update has no projects.</p>;
  const v = p.values;

  return (
    <article className="dashboard">
      <header className="dash-head">
        <p className="dash-file">
          Update #{data.update.id}, {data.update.file_name}, P6 {data.update.p6_version}
        </p>
        <h1 className="dash-project">{p.projectName}</h1>
        {data.projects.length > 1 && (
          <div className="project-tabs" role="tablist" aria-label="Projects in this file">
            {data.projects.map((pr, i) => (
              <button key={pr.projectId} role="tab" aria-selected={i === projectIdx} onClick={() => setProjectIdx(i)}>
                {pr.projectName}
              </button>
            ))}
          </div>
        )}
        <p className="dash-verdict">{verdict(p)}</p>
      </header>

      <Timeline
        plannedStart={p.plannedStart}
        dataDate={s(v.data_date)}
        baselineFinish={s(v.baseline_finish)}
        forecastFinish={s(v.forecast_finish)}
        varianceDays={typeof v.finish_variance_days === "number" ? v.finish_variance_days : null}
      />

      <ProgressBar
        completed={n(v.completed)}
        inProgress={n(v.in_progress)}
        notStarted={n(v.not_started)}
        percentByDuration={typeof v.percent_complete_duration === "number" ? v.percent_complete_duration : null}
      />

      <div className="metric-columns">
        <MetricRows
          title="Where the schedule is at risk"
          keys={["critical_activities", "negative_float_activities", "late_starts", "late_finishes"]}
          values={v}
          definitions={data.definitions}
          alertWhenPositive={["negative_float_activities", "late_starts", "late_finishes"]}
        />
        <MetricRows
          title="Logic and scope"
          keys={["missing_predecessors", "missing_successors", "total_activities", "milestones"]}
          values={v}
          definitions={data.definitions}
          alertWhenPositive={["missing_predecessors", "missing_successors"]}
        />
      </div>

      <CriticalTable
        activities={p.topCritical}
        total={n(v.critical_activities)}
        hoursPerDay={p.hoursPerDay}
        hoursPerDayAssumed={p.hoursPerDayAssumed}
      />

      <section className="warnings" aria-labelledby="warn-title">
        <div className="section-head">
          <h3 id="warn-title">Import warnings</h3>
          <p>
            {warnings.length === 0
              ? "None."
              : `${fmtInt(data.update.warning_count)} found. The file was imported, but check these.`}
          </p>
        </div>
        {warnings.length > 0 && <IssueList issues={warnings} />}
      </section>
    </article>
  );
}
