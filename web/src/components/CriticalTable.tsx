import type { ActivityRef } from "../api";
import { fmtDate, fmtInt } from "../format";
import { useI18n } from "../i18n";

interface Props {
  activities: ActivityRef[];
  total: number;
  hoursPerDay: number;
  hoursPerDayAssumed: boolean;
}

export function CriticalTable({ activities, total, hoursPerDay, hoursPerDayAssumed }: Props) {
  const { t, lang } = useI18n();
  return (
    <section className="critical" aria-labelledby="critical-title">
      <div className="section-head">
        <h3 id="critical-title">{t("criticalTitle")}</h3>
        <p>
          {total === 0
            ? t("criticalNone")
            : t("criticalShowing", { shown: fmtInt(Math.min(activities.length, total), lang), total: fmtInt(total, lang) })}
        </p>
      </div>
      {activities.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">{t("colActivity")}</th>
                <th scope="col">{t("colStatus")}</th>
                <th scope="col" className="num">{t("colFloat")}</th>
                <th scope="col" className="num">{t("colBaselineFinish")}</th>
                <th scope="col" className="num">{t("colEarlyFinish")}</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => (
                <tr key={a.code}>
                  <td>
                    <span className="act-code">{a.code}</span>
                    <span className="act-name" dir="auto">{a.name}</span>
                  </td>
                  <td>{t(`status_${a.status}`)}</td>
                  <td className={`num ${a.totalFloatDays !== null && a.totalFloatDays < 0 ? "is-alert" : ""}`}>
                    {a.totalFloatDays === null ? "—" : `${a.totalFloatDays} d`}
                  </td>
                  <td className="num">{fmtDate(a.baselineFinish, lang)}</td>
                  <td className="num">{fmtDate(a.earlyFinish, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hoursPerDayAssumed && <p className="note">{t("hoursAssumed", { h: hoursPerDay })}</p>}
    </section>
  );
}
