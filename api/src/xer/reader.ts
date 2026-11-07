/**
 * Layer 1 — the raw XER reader.
 *
 * An XER file is plain text, one record per line, tab-separated:
 *   ERMHDR  <version> <export date> ...     first line, identifies the file
 *   %T      <TABLE_NAME>                    starts a table
 *   %F      <field1> <field2> ...           column names for that table
 *   %R      <value1> <value2> ...           one row
 *   %E                                      end of file
 *
 * This layer only checks the *structure* of the file and returns every table
 * as rows keyed by field name. It knows nothing about schedules.
 * Columns are always looked up by name, never by position, because the column
 * order changes between P6 versions.
 */
import { IssueList } from "./issues.js";

export interface RawTable {
  name: string;
  fields: string[];
  rows: Record<string, string>[];
  /** Line where the %T for this table appears. */
  line: number;
  /** Line number of each row, same order as `rows` (used in error messages). */
  rowLines: number[];
}

export interface XerHeader {
  version: string;
  exportDate: string;
  currency: string;
  raw: string[];
}

export interface RawXer {
  header: XerHeader | null;
  tables: Map<string, RawTable>;
  /** "utf-8", "windows-1252", or whatever the caller forced. */
  encoding: string;
  issues: IssueList;
}

/**
 * P6 usually exports in the Windows code page of the machine that exported it
 * (Windows-1252 for Spanish/English, Windows-1256 for Arabic, ...). Newer exports
 * can be UTF-8. The file does not say which one it is, so: strict UTF-8 first,
 * then Windows-1252. Callers that know better can force an encoding.
 * Numbers, dates and codes are ASCII, so a wrong guess only affects names.
 */
export function decodeXer(buf: Uint8Array, forced?: string): { text: string; encoding: string } {
  if (forced) return { text: new TextDecoder(forced).decode(buf).replace(/^\uFEFF/, ""), encoding: forced };
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return { text: text.replace(/^\uFEFF/, ""), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(buf), encoding: "windows-1252" };
  }
}

export function readXer(buf: Uint8Array, opts: { encoding?: string } = {}): RawXer {
  const issues = new IssueList();
  const tables = new Map<string, RawTable>();
  const { text, encoding } = decodeXer(buf, opts.encoding);

  if (text.trim().length === 0) {
    issues.error("EMPTY_FILE", "The file is empty.");
    return { header: null, tables, encoding, issues };
  }

  // Normalise Windows (CRLF) and old Mac (CR) line endings.
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  let header: XerHeader | null = null;
  const first = lines[0] ?? "";
  if (!first.startsWith("ERMHDR")) {
    issues.error(
      "NOT_XER",
      "This does not look like a Primavera P6 XER export: the first line should start with 'ERMHDR'.",
      { line: 1 },
    );
    return { header: null, tables, encoding, issues };
  }
  const h = first.split("\t");
  header = { version: h[1] ?? "", exportDate: h[2] ?? "", currency: h[8] ?? "", raw: h };

  let current: RawTable | null = null;
  let sawEnd = false;
  // After a broken %T (no name / duplicate) we skip its %F and %R lines,
  // so one problem is reported once instead of producing a cascade of errors.
  let skippingTable = false;

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i] ?? "";
    if (line === "") continue; // blank lines (usually the trailing newline)

    if (sawEnd) {
      issues.warning("DATA_AFTER_END", "Found content after the %E end marker; it was ignored.", {
        line: lineNo,
      });
      break;
    }

    const parts = line.split("\t");
    const tag = parts[0];

    if (skippingTable && (tag === "%F" || tag === "%R")) continue;

    switch (tag) {
      case "%T": {
        skippingTable = false;
        const name = (parts[1] ?? "").trim();
        if (!name) {
          issues.error("TABLE_NO_NAME", "A table marker (%T) has no table name.", { line: lineNo });
          current = null;
          skippingTable = true;
          break;
        }
        if (tables.has(name)) {
          issues.error("DUPLICATE_TABLE", `Table ${name} appears more than once in the file.`, {
            line: lineNo,
            table: name,
          });
          current = null;
          skippingTable = true;
          break;
        }
        current = { name, fields: [], rows: [], line: lineNo, rowLines: [] };
        tables.set(name, current);
        break;
      }
      case "%F": {
        if (!current) {
          issues.error("FIELDS_WITHOUT_TABLE", "Found column names (%F) before any table (%T).", {
            line: lineNo,
          });
          break;
        }
        if (current.fields.length > 0) {
          issues.error("DUPLICATE_FIELDS", `Table ${current.name} defines its columns (%F) twice.`, {
            line: lineNo,
            table: current.name,
          });
          break;
        }
        current.fields = parts.slice(1).map((f) => f.trim());
        break;
      }
      case "%R": {
        if (!current) {
          issues.error("ROW_WITHOUT_TABLE", "Found a data row (%R) before any table (%T).", {
            line: lineNo,
          });
          break;
        }
        if (current.fields.length === 0) {
          issues.error(
            "ROW_WITHOUT_FIELDS",
            `Table ${current.name} has a data row before its column names (%F).`,
            { line: lineNo, table: current.name },
          );
          break;
        }
        const values = parts.slice(1);
        if (values.length !== current.fields.length) {
          issues.error(
            "ROW_FIELD_COUNT",
            `Row has ${plural(values.length, "value")} but table ${current.name} has ${plural(current.fields.length, "column")}. ` +
              `The file may be truncated or edited by hand.`,
            { line: lineNo, table: current.name },
          );
          break;
        }
        const row: Record<string, string> = {};
        current.fields.forEach((f, idx) => (row[f] = values[idx] ?? ""));
        current.rows.push(row);
        current.rowLines.push(lineNo);
        break;
      }
      case "%E":
        sawEnd = true;
        break;
      default:
        issues.error(
          "UNKNOWN_LINE",
          `Unexpected line starting with '${(tag ?? "").slice(0, 20)}'. Every line should start with %T, %F, %R or %E.`,
          { line: lineNo },
        );
    }
  }

  if (!sawEnd) {
    issues.warning("MISSING_END", "The file has no %E end marker. It may have been cut off during export or upload.");
  }

  return { header, tables, encoding, issues };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
