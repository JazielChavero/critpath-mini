import { useState } from "react";
import type { Issue, MetricsResponse, ProjectMetrics } from "../api";
import { fmtDate, fmtDecimal, fmtInt } from "../format";
import { useI18n, type TKey } from "../i18n";
import { CriticalTable } from "./CriticalTable";
import { IssueList } from "./IssueList";
import { MetricRows } from "./MetricRows";
import { ProgressBar } from "./ProgressBar";
import { Timeline } from "./Timeline";

const n = (v: unknown) => (typeof v === "number" ? v : 0);
const s = (v: unknown) => (typeof v === "string" ? v : null);

/** One plain sentence about the finish date, built only from computed values. */
function verdict(p: ProjectMetrics, t: ReturnType<typeof useI18n>["t"], lang: ReturnType<typeof useI18n>["lang"]): string {
  const forecast = s(p.values.forecast_finish);
  const variance = p.values.finish_variance_days;
  if (!forecast) return t("noForecast");
  const date = fmtDate(forecast, lang);
  if (typeof variance !== "number") return t("forecastOn", { date });
  const days = fmtDecimal(Math.abs(variance), lang);
  const key: TKey = variance > 0 ? "forecastLate" : variance < 0 ? "forecastEarly" : "forecastEven";
  return t(key, { date, days });
}

interface Props {
  data: MetricsResponse;
  warnings: Issue[];
}

export function Dashboard({ data, warnings }: Props) {
  const { t, lang } = useI18n();
  const [projectIdx, setProjectIdx] = useState(0);
  const p = data.projects[projectIdx] ?? data.projects[0];
  if (!p) return <p className="empty">This update has no projects.</p>;
  const v = p.values;

  return (
    <article className="dashboard">
      <header className="dash-head">
        <p className="dash-file">
          {t("updateLine", { id: data.update.id, file: data.update.file_name, version: data.update.p6_version })}
        </p>
        <h1 className="dash-project">{p.projectName}</h1>
        {data.projects.length > 1 && (
          <div className="project-tabs" role="tablist" aria-label={t("projectsInFile")}>
            {data.projects.map((pr, i) => (
              <button key={pr.projectId} role="tab" aria-selected={i === projectIdx} onClick={() => setProjectIdx(i)}>
                {pr.projectName}
              </button>
            ))}
          </div>
        )}
        <p className="dash-verdict">{verdict(p, t, lang)}</p>
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
          title={t("atRisk")}
          keys={["critical_activities", "negative_float_activities", "late_starts", "late_finishes"]}
          values={v}
          definitions={data.definitions}
          alertWhenPositive={["negative_float_activities", "late_starts", "late_finishes"]}
        />
        <MetricRows
          title={t("logicScope")}
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
          <h3 id="warn-title">{t("warningsTitle")}</h3>
          <p>
            {warnings.length === 0
              ? t("warningsNone")
              : t("warningsSome", { n: fmtInt(data.update.warning_count, lang) })}
          </p>
        </div>
        {warnings.length > 0 && <IssueList issues={warnings} />}
      </section>
    </article>
  );
}
