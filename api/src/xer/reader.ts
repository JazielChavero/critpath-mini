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
  /** Rows keyed by field name. Empty for tables the caller didn't ask to keep. */
  rows: Record<string, string>[];
  /** Number of %R rows, counted for every table, kept or not. */
  rowCount: number;
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

export interface ReadOptions {
  encoding?: string;
  /**
   * Tables whose rows are kept in memory. Every other table is still checked
   * line by line (structure, column count) but its rows are not stored.
   * A large export can have 100k+ rows of resource and activity-code
   * assignments that the metrics never use; keeping them would need hundreds
   * of MB. Omit to keep every table.
   */
  keepTables?: ReadonlySet<string>;
}

/** Yields [lineNumber, line] without splitting the whole file into an array. */
function* eachLine(text: string): Generator<[number, string]> {
  let start = 0;
  let n = 0;
  while (start <= text.length) {
    let end = text.indexOf("\n", start);
    if (end === -1) end = text.length;
    let line = text.slice(start, end);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    yield [++n, line];
    start = end + 1;
  }
}

export function readXer(buf: Uint8Array, opts: ReadOptions = {}): RawXer {
  const issues = new IssueList();
  const tables = new Map<string, RawTable>();
  const { text, encoding } = decodeXer(buf, opts.encoding);

  if (text.trim().length === 0) {
    issues.error("EMPTY_FILE", "The file is empty.");
    return { header: null, tables, encoding, issues };
  }

  // Old Mac line endings (CR only) are rare enough to normalise up front;
  // Windows CRLF is handled line by line in eachLine().
  const body = text.includes("\n") ? text : text.replace(/\r/g, "\n");
  const lines = eachLine(body);

  let header: XerHeader | null = null;
  const first = lines.next().value?.[1] ?? "";
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

  for (const [lineNo, line] of lines) {
    if (line === "") continue; // blank lines (usually the trailing newline)

    if (sawEnd) {
      issues.warning("DATA_AFTER_END", "Found content after the %E end marker; it was ignored.", {
        line: lineNo,
      });
      break;
    }

    const tab = line.indexOf("\t");
    const tag = tab === -1 ? line : line.slice(0, tab);

    if (skippingTable && (tag === "%F" || tag === "%R")) continue;

    // Rows of tables we don't keep: check the column count without building objects.
    if (tag === "%R" && current && current.fields.length > 0 && opts.keepTables && !opts.keepTables.has(current.name)) {
      let values = 0;
      for (let i = tab; i !== -1; i = line.indexOf("\t", i + 1)) values++;
      if (values !== current.fields.length) {
        issues.error(
          "ROW_FIELD_COUNT",
          `Row has ${plural(values, "value")} but table ${current.name} has ${plural(current.fields.length, "column")}. ` +
            `The file may be truncated or edited by hand.`,
          { line: lineNo, table: current.name },
        );
      } else {
        current.rowCount++;
      }
      continue;
    }

    const parts = line.split("\t");

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
        current = { name, fields: [], rows: [], rowCount: 0, line: lineNo, rowLines: [] };
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
        current.rowCount++;
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
