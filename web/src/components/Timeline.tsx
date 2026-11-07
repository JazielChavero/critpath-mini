/**
 * The project on one line, the way a scheduler reads a P6 Gantt chart:
 * planned start, the data date line (progress is reported up to here),
 * and the baseline finish against the forecast finish.
 */
import type { ReactNode } from "react";
import { dayNumber, fmtDate, fmtValue } from "../format";
import { useI18n } from "../i18n";

interface Props {
  plannedStart: string | null;
  dataDate: string | null;
  baselineFinish: string | null;
  forecastFinish: string | null;
  varianceDays: number | null;
}

type Side = "above" | "below";

export function Timeline({ plannedStart, dataDate, baselineFinish, forecastFinish, varianceDays }: Props) {
  const { t, lang } = useI18n();
  const points = [plannedStart, dataDate, baselineFinish, forecastFinish].filter((d): d is string => !!d);
  if (points.length < 2) return null;

  const nums = points.map(dayNumber);
  const min = Math.min(...nums);
  const span = Math.max(Math.max(...nums) - min, 1);
  const frac = (iso: string) => (dayNumber(iso) - min) / span;

  const late = (varianceDays ?? 0) > 0;
  const close = (a: string | null, b: string | null) => !!a && !!b && Math.abs(frac(a) - frac(b)) < 0.2;

  // Data date always goes above. Planned start, baseline and forecast go below,
  // unless they would collide with each other; then the baseline moves above
  // (or the forecast does, if the baseline is already crowded by the data date).
  let baselineSide: Side = "below";
  let forecastSide: Side = "below";
  if (close(baselineFinish, forecastFinish)) {
    if (close(baselineFinish, dataDate)) forecastSide = "above";
    else baselineSide = "above";
  }

  return (
    <figure className="tl" aria-label={t("timeline")}>
      <div className="tl-track">
        <div className="tl-rail" />
        {plannedStart && dataDate && (
          <div
            className="tl-elapsed"
            style={{ left: pct(frac(plannedStart)), width: pct(frac(dataDate) - frac(plannedStart)) }}
          />
        )}
        {dataDate && (
          <Point at={frac(dataDate)} kind="datadate" side="above">
            {t("dataDate")} <strong>{fmtDate(dataDate, lang)}</strong>
          </Point>
        )}
        {plannedStart && (
          <Point at={frac(plannedStart)} kind="start" side="below">
            {t("plannedStart")} <strong>{fmtDate(plannedStart, lang)}</strong>
          </Point>
        )}
        {baselineFinish && (
          <Point at={frac(baselineFinish)} kind="baseline" side={baselineSide}>
            {t("baselineFinish")} <strong>{fmtDate(baselineFinish, lang)}</strong>
          </Point>
        )}
        {forecastFinish && (
          <Point at={frac(forecastFinish)} kind={late ? "forecast is-late" : "forecast"} side={forecastSide}>
            {t("forecastFinish")} <strong>{fmtDate(forecastFinish, lang)}</strong>
            {varianceDays !== null && (
              <em className={late ? "is-late" : varianceDays === 0 ? "is-even" : ""}>{t("vsBaseline", { days: fmtValue(varianceDays, "days", lang) })}</em>
            )}
          </Point>
        )}
      </div>
    </figure>
  );
}

const pct = (f: number) => `${(f * 100).toFixed(3)}%`;

function Point({ at, kind, side, children }: { at: number; kind: string; side: Side; children: ReactNode }) {
  // Keep labels inside the chart: near the right edge they hang to the left.
  const align = at > 0.75 ? "end" : at < 0.25 ? "start" : "middle";
  return (
    <div className={`tl-point tl-${kind.split(" ")[0]}`} style={{ left: pct(at) }}>
      <i className={`tl-marker ${kind}`} aria-hidden="true" />
      <span className={`tl-label tl-${side} tl-align-${align}`}>{children}</span>
    </div>
  );
}
