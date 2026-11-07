/**
 * The written summary. Every computed value inside the text is marked: hover
 * (or focus) shows which metric it is. The note under the text says whether a
 * model wrote it and that every number was checked.
 */
import { useEffect, useState } from "react";
import { AuthError, getSummary, type SummaryResponse } from "../api";
import { useI18n } from "../i18n";

interface Props {
  updateId: number;
  projectId: string;
  onAuthError: () => void;
}

export function Summary({ updateId, projectId, onAuthError }: Props) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (refresh: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setData(await getSummary(updateId, projectId, lang, refresh));
    } catch (err) {
      if (err instanceof AuthError) onAuthError();
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setData(null);
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateId, projectId, lang]);

  return (
    <section className="summary" aria-labelledby="summary-title" aria-busy={busy}>
      <div className="section-head">
        <h3 id="summary-title">{t("summaryTitle")}</h3>
        {data && !busy && (
          <button type="button" className="btn btn-quiet btn-small" onClick={() => load(true)}>
            {t("summaryRegenerate")}
          </button>
        )}
      </div>

      {busy && !data && (
        <p className="summary-status" role="status">
          {t("summaryWriting")}
        </p>
      )}
      {error && (
        <p className="summary-status summary-error" role="alert">
          {t("summaryUnavailable")} {error}
        </p>
      )}

      {data && (
        <>
          <p className={`summary-text ${busy ? "is-refreshing" : ""}`}>
            {data.segments.map((s, i) =>
              s.fact ? (
                <mark key={i} className="fact" title={s.label ?? undefined} tabIndex={0} dir="auto">
                  {s.text}
                </mark>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </p>
          <p className="note">
            {data.source === "ai"
              ? t("summaryByAi", { model: data.model ?? "" })
              : t("summaryByTemplate", {
                  reason: t(
                    data.reasonCode === "model_error"
                      ? "reasonModelError"
                      : data.reasonCode === "all_rejected"
                        ? "reasonAllRejected"
                        : "reasonNoModel",
                  ),
                })}
            {data.attempts.length > 1 && data.source === "ai" ? ` ${t("summaryRetried", { n: data.attempts.length - 1 })}` : ""}
          </p>
        </>
      )}
    </section>
  );
}
