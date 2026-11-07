import { fmtInt } from "../format";

interface Props {
  completed: number;
  inProgress: number;
  notStarted: number;
  percentByDuration: number | null;
}

/** Activities by status as one segmented bar, plus the duration-weighted percent. */
export function ProgressBar({ completed, inProgress, notStarted, percentByDuration }: Props) {
  const total = completed + inProgress + notStarted || 1;
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <section className="progress" aria-label="Progress">
      <p className="progress-headline">
        <strong>{percentByDuration === null ? "—" : `${percentByDuration.toFixed(1)}%`}</strong> complete, weighted by
        planned duration
      </p>
      <div className="progress-bar" role="img" aria-label={`${completed} completed, ${inProgress} in progress, ${notStarted} not started`}>
        <span className="seg seg-done" style={{ width: seg(completed) }} />
        <span className="seg seg-active" style={{ width: seg(inProgress) }} />
        <span className="seg seg-todo" style={{ width: seg(notStarted) }} />
      </div>
      <ul className="progress-legend">
        <li><i className="seg-done" />{fmtInt(completed)} completed</li>
        <li><i className="seg-active" />{fmtInt(inProgress)} in progress</li>
        <li><i className="seg-todo" />{fmtInt(notStarted)} not started</li>
      </ul>
    </section>
  );
}
