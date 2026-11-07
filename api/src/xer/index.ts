/**
 * Public entry point: bytes in, trusted schedule (or a list of problems) out.
 */
import { IssueList, type Issue } from "./issues.js";
import { readXer, type XerHeader } from "./reader.js";
import { buildSchedule, type Schedule } from "./schedule.js";

export type ParseResult =
  | { ok: true; header: XerHeader; encoding: string; schedule: Schedule; warnings: Issue[] }
  | { ok: false; errors: Issue[]; warnings: Issue[] };

export function parseXer(buf: Uint8Array): ParseResult {
  const raw = readXer(buf);
  const issues = new IssueList();
  issues.merge(raw.issues);

  // Structural errors mean the tables themselves cannot be trusted.
  if (raw.issues.hasErrors || !raw.header) {
    return split(issues);
  }

  const built = buildSchedule(raw);
  issues.merge(built.issues);
  if (issues.hasErrors) return split(issues);

  return {
    ok: true,
    header: raw.header,
    encoding: raw.encoding,
    schedule: built.schedule,
    warnings: issues.items.filter((i) => i.severity === "warning"),
  };
}

function split(issues: IssueList): ParseResult {
  return {
    ok: false,
    errors: issues.items.filter((i) => i.severity === "error"),
    warnings: issues.items.filter((i) => i.severity === "warning"),
  };
}

export * from "./issues.js";
export type * from "./schedule.js";
export type { XerHeader } from "./reader.js";
