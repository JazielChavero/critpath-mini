/**
 * Every problem the parser finds becomes an Issue.
 * - "error": the file cannot be trusted; it is rejected and nothing is saved.
 * - "warning": the file is usable, but the user should know about it.
 */
export type Severity = "error" | "warning";

export interface Issue {
  severity: Severity;
  /** Stable machine-readable code, e.g. "ROW_FIELD_COUNT". */
  code: string;
  /** Human-readable explanation that says what is wrong and where. */
  message: string;
  /** 1-based line number in the file, when the issue maps to a line. */
  line?: number;
  table?: string;
  field?: string;
}

export class IssueList {
  readonly items: Issue[] = [];

  error(code: string, message: string, ctx: Partial<Issue> = {}): void {
    this.items.push({ severity: "error", code, message, ...ctx });
  }

  warning(code: string, message: string, ctx: Partial<Issue> = {}): void {
    this.items.push({ severity: "warning", code, message, ...ctx });
  }

  get hasErrors(): boolean {
    return this.items.some((i) => i.severity === "error");
  }

  merge(other: IssueList): void {
    this.items.push(...other.items);
  }
}

export function formatIssue(i: Issue): string {
  const where = [
    i.line !== undefined ? `line ${i.line}` : null,
    i.table ? `table ${i.table}` : null,
    i.field ? `field ${i.field}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return `[${i.severity.toUpperCase()}] ${i.code}${where ? ` (${where})` : ""}: ${i.message}`;
}
