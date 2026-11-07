/**
 * Metrics as rows. Every value can be opened to show the exact formula behind
 * it, taken from the API's formula table.
 */
import { useState } from "react";
import type { MetricDefinition } from "../api";
import { fmtValue } from "../format";
import { useI18n } from "../i18n";

interface Props {
  title: string;
  keys: string[];
  values: Record<string, number | string | null>;
  definitions: MetricDefinition[];
  /** Keys whose value is a problem when greater than zero. */
  alertWhenPositive?: string[];
}

export function MetricRows({ title, keys, values, definitions, alertWhenPositive = [] }: Props) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const byKey = new Map(definitions.map((d) => [d.key, d]));

  return (
    <section className="metric-group" aria-labelledby={`mg-${title}`}>
      <h3 id={`mg-${title}`}>{title}</h3>
      <dl>
        {keys.map((key) => {
          const def = byKey.get(key);
          if (!def) return null;
          const v = values[key];
          const alert = alertWhenPositive.includes(key) && typeof v === "number" && v > 0;
          const isOpen = open === key;
          return (
            <div key={key} className={`metric-row ${isOpen ? "is-open" : ""}`}>
              <dt>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`f-${key}`}
                  onClick={() => setOpen(isOpen ? null : key)}
                  title={t("showFormula")}
                >
                  <span>{lang === "es" ? def.es.label : def.label}</span>
                  <span className="metric-chevron" aria-hidden="true" />
                </button>
              </dt>
              <dd className={`metric-value ${alert ? "is-alert" : ""}`}>{fmtValue(v, def.unit, lang)}</dd>
              {isOpen && (
                <dd className="metric-formula" id={`f-${key}`}>
                  {lang === "es" ? def.es.formula : def.formula}
                </dd>
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
