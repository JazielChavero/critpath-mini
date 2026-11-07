import { fmtInt, fmtValue } from "../format";
import { useI18n } from "../i18n";

interface Props {
  completed: number;
  inProgress: number;
  notStarted: number;
  percentByDuration: number | null;
}

/** Activities by status as one segmented bar, plus the duration-weighted percent. */
export function ProgressBar({ completed, inProgress, notStarted, percentByDuration }: Props) {
  const { t, lang } = useI18n();
  const total = completed + inProgress + notStarted || 1;
  const seg = (n: number) => `${(n / total) * 100}%`;
  const labels = [
    t("completed", { n: fmtInt(completed, lang) }),
    t("inProgress", { n: fmtInt(inProgress, lang) }),
    t("notStarted", { n: fmtInt(notStarted, lang) }),
  ];
  return (
    <section className="progress" aria-label={t("progress")}>
      <p className="progress-headline">
        <strong>{fmtValue(percentByDuration, "percent", lang)}</strong> {t("completeByDuration")}
      </p>
      <div className="progress-bar" role="img" aria-label={labels.join(", ")}>
        <span className="seg seg-done" style={{ width: seg(completed) }} />
        <span className="seg seg-active" style={{ width: seg(inProgress) }} />
        <span className="seg seg-todo" style={{ width: seg(notStarted) }} />
      </div>
      <ul className="progress-legend">
        <li><i className="seg-done" />{labels[0]}</li>
        <li><i className="seg-active" />{labels[1]}</li>
        <li><i className="seg-todo" />{labels[2]}</li>
      </ul>
    </section>
  );
}
