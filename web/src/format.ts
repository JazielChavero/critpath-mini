/**
 * Display formatting. Dates from the API are local schedule dates without a
 * time zone ("2008-05-27T00:00:00"), so they are formatted from their parts and
 * never converted through the browser's time zone.
 */
import type { Lang } from "./i18n";

const MONTHS: Record<Lang, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
};
const LOCALE: Record<Lang, string> = { en: "en-US", es: "es-MX" };

export function fmtDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[lang][m - 1]} ${y}`;
}

/** Days from the Unix epoch, ignoring time zones (for positioning on the timeline). */
export function dayNumber(iso: string): number {
  const [date, time = "00:00:00"] = iso.split("T");
  const [y, m, d] = date!.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return Date.UTC(y!, m! - 1, d!, hh ?? 0, mm ?? 0) / 86_400_000;
}

export function fmtInt(n: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE[lang]).format(n);
}

/** A number with exactly one decimal, in the language's style. */
export function fmtDecimal(n: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE[lang], { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
}

export function fmtValue(v: number | string | null | undefined, unit: string, lang: Lang): string {
  if (v === null || v === undefined) return "—";
  if (unit === "date") return fmtDate(String(v), lang);
  if (typeof v !== "number") return String(v);
  if (unit === "percent") return `${fmtDecimal(v, lang)}%`;
  if (unit === "days") return `${v > 0 ? "+" : ""}${fmtDecimal(v, lang)} d`;
  return fmtInt(v, lang);
}

export function fmtUploaded(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleString(lang === "es" ? "es-MX" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
