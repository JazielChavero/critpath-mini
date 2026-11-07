import type { ActivityRef } from "../api";
import { fmtDate, fmtInt } from "../format";

const STATUS: Record<ActivityRef["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

interface Props {
  activities: ActivityRef[];
  total: number;
  hoursPerDay: number;
  hoursPerDayAssumed: boolean;
}

export function CriticalTable({ activities, total, hoursPerDay, hoursPerDayAssumed }: Props) {
  return (
    <section className="critical" aria-labelledby="critical-title">
      <div className="section-head">
        <h3 id="critical-title">Critical activities</h3>
        <p>
          {total === 0
            ? "No incomplete activity is critical."
            : `Showing ${fmtInt(Math.min(activities.length, total))} of ${fmtInt(total)}, lowest float first.`}
        </p>
      </div>
      {activities.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Activity</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">Total float</th>
                <th scope="col" className="num">Baseline finish</th>
                <th scope="col" className="num">Early finish</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => (
                <tr key={a.code}>
                  <td>
                    <span className="act-code">{a.code}</span>
                    <span className="act-name" dir="auto">{a.name}</span>
                  </td>
                  <td>{STATUS[a.status]}</td>
                  <td className={`num ${a.totalFloatDays !== null && a.totalFloatDays < 0 ? "is-alert" : ""}`}>
                    {a.totalFloatDays === null ? "—" : `${a.totalFloatDays} d`}
                  </td>
                  <td className="num">{fmtDate(a.baselineFinish)}</td>
                  <td className="num">{fmtDate(a.earlyFinish)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hoursPerDayAssumed && (
        <p className="note">
          Float is shown in days assuming {hoursPerDay} working hours per day: this file doesn't include the calendar's
          hours.
        </p>
      )}
    </section>
  );
}
