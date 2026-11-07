import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/metrics/compute.js";
import { METRICS } from "../src/metrics/definitions.js";
import { parseXer } from "../src/xer/index.js";
import type { Project, Relationship, Task } from "../src/xer/schedule.js";

const project: Project = {
  id: "P",
  shortName: "TEST",
  dataDate: "2024-03-01T00:00:00",
  plannedStart: "2024-01-01T08:00:00",
  mustFinishBy: null,
  scheduledFinish: null,
  criticalPathType: "total_float",
  criticalFloatHrs: 0,
  calendarHoursPerDay: 8,
};

let n = 0;
function task(o: Partial<Task>): Task {
  n++;
  return {
    id: `T${n}`, projectId: "P", wbsId: null, code: `A${n}`, name: `Activity ${n}`,
    type: "task", status: "not_started", percentCompleteType: "duration", physicalPercent: 0,
    plannedDurationHrs: 80, remainingDurationHrs: 80, totalFloatHrs: 40, freeFloatHrs: 0,
    actualStart: null, actualFinish: null, earlyStart: null, earlyFinish: "2024-06-01T17:00:00",
    lateStart: null, lateFinish: null, baselineStart: "2024-04-01T08:00:00", baselineFinish: "2024-05-01T17:00:00",
    onDrivingPath: false, ...o,
  };
}
const link = (pred: Task, succ: Task): Relationship => ({
  id: `${pred.id}-${succ.id}`, predecessorId: pred.id, successorId: succ.id, type: "FS", lagHrs: 0,
});

describe("formula table", () => {
  it("has a definition for every computed metric and nothing else", () => {
    const m = computeMetrics(project, [task({})], []);
    expect(Object.keys(m.values).sort()).toEqual(METRICS.map((d) => d.key).sort());
  });
});

describe("computeMetrics", () => {
  it("weights percent complete by duration and clamps overruns", () => {
    const tasks = [
      task({ status: "completed", plannedDurationHrs: 100, remainingDurationHrs: 0 }), // 100 done
      task({ status: "in_progress", plannedDurationHrs: 100, remainingDurationHrs: 25 }), // 75 done
      task({ status: "in_progress", plannedDurationHrs: 100, remainingDurationHrs: 130 }), // overrun → 0, not -30
      task({ status: "not_started", plannedDurationHrs: 100, remainingDurationHrs: 100 }), // 0
      task({ type: "finish_milestone", plannedDurationHrs: 0, remainingDurationHrs: 0 }), // ignored (0 duration)
    ];
    expect(computeMetrics(project, tasks, []).values.percent_complete_duration).toBe(43.8); // 175 / 400
  });

  it("excludes level-of-effort and WBS-summary activities everywhere", () => {
    const tasks = [task({}), task({ type: "level_of_effort" }), task({ type: "wbs_summary" })];
    expect(computeMetrics(project, tasks, []).values.total_activities).toBe(1);
  });

  it("uses the project's critical float threshold, only on incomplete work", () => {
    const tasks = [
      task({ totalFloatHrs: 0 }),
      task({ totalFloatHrs: -16 }),
      task({ totalFloatHrs: 8 }),
      task({ totalFloatHrs: 0, status: "completed" }), // finished work is never critical
      task({ totalFloatHrs: null }),
    ];
    let v = computeMetrics(project, tasks, []).values;
    expect(v.critical_activities).toBe(2);
    expect(v.negative_float_activities).toBe(1);

    v = computeMetrics({ ...project, criticalFloatHrs: 8 }, tasks, []).values;
    expect(v.critical_activities).toBe(3);
  });

  it("uses the driving-path flag when the project is set to longest path", () => {
    const tasks = [task({ onDrivingPath: true, totalFloatHrs: 40 }), task({ totalFloatHrs: 0 })];
    const v = computeMetrics({ ...project, criticalPathType: "longest_path" }, tasks, []).values;
    expect(v.critical_activities).toBe(1);
  });

  it("counts late starts and late finishes against the data date", () => {
    const tasks = [
      task({ baselineStart: "2024-02-01T08:00:00", baselineFinish: "2024-02-20T17:00:00" }), // late start + late finish
      task({ status: "in_progress", baselineStart: "2024-02-01T08:00:00", baselineFinish: "2024-04-01T17:00:00" }), // started: not a late start
      task({ status: "completed", baselineFinish: "2024-01-15T17:00:00" }), // completed: not late
      task({}), // future
    ];
    const v = computeMetrics(project, tasks, []).values;
    expect(v.late_starts).toBe(1);
    expect(v.late_finishes).toBe(1);
  });

  it("finds open ends, ignoring the start and finish milestones", () => {
    const start = task({ type: "start_milestone" });
    const a = task({});
    const b = task({});
    const orphan = task({});
    const finish = task({ type: "finish_milestone" });
    const v = computeMetrics(project, [start, a, b, orphan, finish], [link(start, a), link(a, b), link(b, finish)]).values;
    expect(v.missing_predecessors).toBe(1); // orphan
    expect(v.missing_successors).toBe(1); // orphan
  });

  it("compares forecast and baseline finish in calendar days", () => {
    const tasks = [task({ baselineFinish: "2024-05-01T17:00:00", earlyFinish: "2024-05-11T05:00:00" })];
    const v = computeMetrics(project, tasks, []).values;
    expect(v.forecast_finish).toBe("2024-05-11T05:00:00");
    expect(v.finish_variance_days).toBe(9.5);
  });

  it("lists critical activities lowest float first, in days", () => {
    const tasks = [task({ code: "B", totalFloatHrs: 0 }), task({ code: "A", totalFloatHrs: -24 })];
    const m = computeMetrics(project, tasks, []);
    expect(m.topCritical.map((t) => [t.code, t.totalFloatDays])).toEqual([["A", -3], ["B", 0]]);
  });

  it("says when hours per day had to be assumed", () => {
    const m = computeMetrics({ ...project, calendarHoursPerDay: null }, [task({})], []);
    expect(m).toMatchObject({ hoursPerDay: 8, hoursPerDayAssumed: true });
  });
});

/**
 * Golden values produced by tools/independent_metrics.py, a separate Python
 * implementation of the formula table that shares no code with this app.
 */
const GOLDEN: Record<string, Record<string, number | string | null>> = {
  "airport.xer": {
    data_date: "2012-05-01T00:00:00", total_activities: 66, completed: 0, in_progress: 0, not_started: 66,
    milestones: 3, percent_complete_duration: 0, critical_activities: 1, negative_float_activities: 0,
    late_starts: 0, late_finishes: 0, missing_predecessors: 0, missing_successors: 0,
    baseline_finish: "2013-02-27T17:00:00", forecast_finish: "2013-02-27T17:00:00", finish_variance_days: 0,
  },
  "sample.xer": {
    data_date: "2021-03-12T00:00:00", total_activities: 42, completed: 0, in_progress: 0, not_started: 42,
    milestones: 12, percent_complete_duration: 0, critical_activities: 42, negative_float_activities: 0,
    late_starts: 0, late_finishes: 0, missing_predecessors: 0, missing_successors: 0,
    baseline_finish: "2021-10-07T16:00:00", forecast_finish: "2021-10-07T16:00:00", finish_variance_days: 0,
  },
  "rehab-2.xer": {
    data_date: "2008-05-27T00:00:00", total_activities: 6977, completed: 2037, in_progress: 176, not_started: 4764,
    milestones: 3, percent_complete_duration: 28.7, critical_activities: 253, negative_float_activities: 0,
    late_starts: 0, late_finishes: 122, missing_predecessors: 0, missing_successors: 10,
    baseline_finish: "2010-05-02T08:01:00", forecast_finish: "2010-05-01T17:00:00", finish_variance_days: -0.6,
  },
};

const DIR = process.env.XER_SAMPLES_DIR ?? join(import.meta.dirname, "..", "samples");

describe.each(Object.entries(GOLDEN))("metrics match the independent Python calculation: %s", (file, expected) => {
  it.skipIf(!existsSync(join(DIR, file)))("all values", () => {
    const r = parseXer(readFileSync(join(DIR, file)));
    if (!r.ok) throw new Error("sample failed to parse");
    const m = computeMetrics(r.schedule.projects[0]!, r.schedule.tasks, r.schedule.relationships);
    expect(m.values).toEqual(expected);
  });
});
