/**
 * Display formatting. Dates from the API are local schedule dates without a
 * time zone ("2008-05-27T00:00:00"), so they are formatted from their parts and
 * never converted through the browser's time zone.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Days from the Unix epoch, ignoring time zones (for positioning on the timeline). */
export function dayNumber(iso: string): number {
  const [date, time = "00:00:00"] = iso.split("T");
  const [y, m, d] = date!.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return Date.UTC(y!, m! - 1, d!, hh ?? 0, mm ?? 0) / 86_400_000;
}

const intFmt = new Intl.NumberFormat("en-US");

export function fmtValue(v: number | string | null | undefined, unit: string): string {
  if (v === null || v === undefined) return "—";
  if (unit === "date") return fmtDate(String(v));
  if (typeof v !== "number") return String(v);
  if (unit === "percent") return `${v.toFixed(1)}%`;
  if (unit === "days") return `${v > 0 ? "+" : ""}${v.toFixed(1)} d`;
  return intFmt.format(v);
}

export const fmtInt = (n: number) => intFmt.format(n);

export function fmtUploaded(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
