import { describe, expect, it } from "vitest";
import { parseXer, type ParseResult } from "../src/xer/index.js";
import { DEFAULT_TASKS, PRED, PROJECT, TASK_FIELDS, cp1252, taskRow, utf8, xer } from "./fixtures.js";

function ok(r: ParseResult) {
  if (!r.ok) throw new Error("Expected success, got errors:\n" + r.errors.map((e) => e.message).join("\n"));
  return r;
}

function codes(r: ParseResult): string[] {
  if (r.ok) throw new Error("Expected the file to be rejected, but it was accepted");
  return r.errors.map((e) => e.code);
}

describe("valid files", () => {
  it("parses a small schedule into typed values", () => {
    const r = ok(parseXer(utf8(xer())));
    const { projects, tasks, relationships, wbs } = r.schedule;

    expect(projects).toEqual([
      {
        id: "100",
        shortName: "TORRE-A",
        dataDate: "2024-03-01T00:00:00",
        plannedStart: "2024-01-08T08:00:00",
        mustFinishBy: null,
        scheduledFinish: "2024-12-20T17:00:00",
        criticalPathType: "total_float",
        criticalFloatHrs: 0,
        calendarHoursPerDay: null, // this fixture has no CALENDAR table
      },
    ]);
    expect(wbs).toHaveLength(2);
    expect(tasks).toHaveLength(2);
    expect(tasks[1]).toMatchObject({
      code: "A1010",
      status: "in_progress",
      physicalPercent: 40,
      plannedDurationHrs: 80,
      remainingDurationHrs: 48,
      totalFloatHrs: 0,
      actualFinish: null,
      onDrivingPath: true,
    });
    expect(relationships).toEqual([{ id: "5000", successorId: "1001", predecessorId: "1000", type: "FS", lagHrs: 0 }]);
    expect(r.warnings).toEqual([]);
  });

  it("handles Windows line endings (CRLF)", () => {
    const r = ok(parseXer(utf8(xer({}, "\r\n"))));
    expect(r.schedule.tasks).toHaveLength(2);
    expect(r.schedule.tasks[0]!.name).toBe("Excavación"); // no stray \r at the end of values
  });

  it("reads Windows-1252 files with accents correctly", () => {
    const r = ok(parseXer(cp1252(xer())));
    expect(r.encoding).toBe("windows-1252");
    expect(r.schedule.tasks[0]!.name).toBe("Excavación");
  });

  it("finds columns by name, not by position", () => {
    // Same data, columns in a different order (P6 versions do this).
    const fields = TASK_FIELDS.split("\t").slice(1);
    const reversed = [...fields].reverse();
    const values = taskRow().split("\t").slice(1);
    const byField = Object.fromEntries(fields.map((f, i) => [f, values[i]]));
    const tasks = [
      "%T\tTASK",
      ["%F", ...reversed].join("\t"),
      ["%R", ...reversed.map((f) => byField[f])].join("\t"),
    ];
    const r = ok(parseXer(utf8(xer({ tasks, pred: [] }))));
    expect(r.schedule.tasks[0]).toMatchObject({ code: "A1000", status: "completed", plannedDurationHrs: 80 });
  });

  it("skips links to activities of other projects with a warning", () => {
    const pred = [PRED[0]!, PRED[1]!, "%R\t5001\t1001\t9999\t100\t777\tPR_FS\t0"];
    const r = ok(parseXer(utf8(xer({ pred }))));
    expect(r.schedule.relationships).toHaveLength(0);
    expect(r.warnings.map((w) => w.code)).toEqual(["EXTERNAL_RELATIONSHIP"]);
  });

  it("warns (without rejecting) about suspicious progress", () => {
    const tasks = ["%T\tTASK", TASK_FIELDS, taskRow({ act_end_date: "" })];
    const r = ok(parseXer(utf8(xer({ tasks, pred: [] }))));
    expect(r.warnings.map((w) => w.code)).toEqual(["COMPLETED_NO_FINISH"]);
  });

  it("warns when the end marker is missing", () => {
    const r = ok(parseXer(utf8(xer({ end: false }))));
    expect(r.warnings.map((w) => w.code)).toContain("MISSING_END");
  });
});

describe("broken files are rejected with a clear reason", () => {
  it("empty file", () => {
    expect(codes(parseXer(utf8("")))).toEqual(["EMPTY_FILE"]);
  });

  it("not an XER file", () => {
    const r = parseXer(utf8("name,start,finish\nExcavación,2024-01-01,2024-01-10\n"));
    expect(codes(r)).toEqual(["NOT_XER"]);
  });

  it("row with a missing value (truncated file) — reports the line", () => {
    const broken = DEFAULT_TASKS.slice();
    broken[2] = broken[2]!.split("\t").slice(0, -3).join("\t");
    const r = parseXer(utf8(xer({ tasks: broken })));
    expect(codes(r)).toEqual(["ROW_FIELD_COUNT"]);
    expect(r.ok ? null : r.errors[0]!.line).toBe(1 + PROJECT.length + 4 + 3); // header + PROJECT + WBS + 3rd TASK line
  });

  it("a truncated row in a table we don't keep (e.g. resources) still rejects the file", () => {
    const pred = [...PRED, "%T\tTASKRSRC", "%F\ttaskrsrc_id\ttask_id\trsrc_id", "%R\t1\t1000\t7", "%R\t2\t1000"];
    const r = parseXer(utf8(xer({ pred })));
    expect(codes(r)).toEqual(["ROW_FIELD_COUNT"]);
    expect(r.ok ? null : r.errors[0]).toMatchObject({ table: "TASKRSRC" });
  });

  it("row before column names", () => {
    const tasks = ["%T\tTASK", taskRow(), TASK_FIELDS];
    expect(codes(parseXer(utf8(xer({ tasks }))))).toContain("ROW_WITHOUT_FIELDS");
  });

  it("garbage line", () => {
    const tasks = [...DEFAULT_TASKS, "hello world"];
    expect(codes(parseXer(utf8(xer({ tasks }))))).toEqual(["UNKNOWN_LINE"]);
  });

  it("table appears twice", () => {
    expect(codes(parseXer(utf8(xer({ pred: [...PRED, ...PRED] }))))).toEqual(["DUPLICATE_TABLE"]);
  });

  it("no activities", () => {
    expect(codes(parseXer(utf8(xer({ tasks: [], pred: [] }))))).toEqual(["NO_TASKS"]);
  });

  it("missing required column", () => {
    const tasks = ["%T\tTASK", TASK_FIELDS.replace("\tstatus_code", ""), taskRow().replace("\tTK_Complete", "")];
    const r = parseXer(utf8(xer({ tasks, pred: [] })));
    expect(codes(r)).toEqual(["MISSING_COLUMNS"]);
  });

  it("invalid date", () => {
    const tasks = ["%T\tTASK", TASK_FIELDS, taskRow({ act_start_date: "2024-02-30 08:00" })];
    const r = parseXer(utf8(xer({ tasks, pred: [] })));
    expect(codes(r)).toEqual(["BAD_DATE"]);
    expect(r.ok ? null : r.errors[0]).toMatchObject({ table: "TASK", field: "act_start_date" });
  });

  it("invalid number (comma decimal)", () => {
    const tasks = ["%T\tTASK", TASK_FIELDS, taskRow({ phys_complete_pct: "12,5" })];
    expect(codes(parseXer(utf8(xer({ tasks, pred: [] }))))).toEqual(["BAD_NUMBER"]);
  });

  it("percent out of range", () => {
    const tasks = ["%T\tTASK", TASK_FIELDS, taskRow({ phys_complete_pct: "140" })];
    expect(codes(parseXer(utf8(xer({ tasks, pred: [] }))))).toEqual(["OUT_OF_RANGE"]);
  });

  it("unknown status", () => {
    const tasks = ["%T\tTASK", TASK_FIELDS, taskRow({ status_code: "TK_Paused" })];
    expect(codes(parseXer(utf8(xer({ tasks, pred: [] }))))).toEqual(["UNKNOWN_VALUE"]);
  });

  it("duplicate activity id", () => {
    const tasks = ["%T\tTASK", TASK_FIELDS, taskRow(), taskRow({ task_code: "A2000" })];
    expect(codes(parseXer(utf8(xer({ tasks, pred: [] }))))).toEqual(["DUPLICATE_ID"]);
  });

  it("relationship to an activity that does not exist in the same project", () => {
    const pred = [PRED[0]!, PRED[1]!, "%R\t5001\t1001\t4242\t100\t100\tPR_FS\t0"];
    expect(codes(parseXer(utf8(xer({ pred }))))).toEqual(["DANGLING_RELATIONSHIP"]);
  });

  it("reports every problem at once, not just the first", () => {
    const tasks = [
      "%T\tTASK",
      TASK_FIELDS,
      taskRow({ phys_complete_pct: "abc" }),
      taskRow({ task_id: "1001", task_code: "A1010", target_start_date: "yesterday" }),
    ];
    const r = parseXer(utf8(xer({ tasks, pred: [] })));
    expect(codes(r).sort()).toEqual(["BAD_DATE", "BAD_NUMBER"]);
  });
});
