/**
 * Layer 2 — from raw tables to a typed schedule.
 *
 * Takes the PROJECT, PROJWBS, TASK and TASKPRED tables, converts every value
 * to its real type (dates, numbers, enums) and checks that the data is
 * consistent (every activity belongs to a known project, relationships point
 * to activities that exist, percentages are 0-100, ...).
 *
 * Nothing here is guessed: if a value cannot be converted, it is reported.
 */
import { IssueList } from "./issues.js";
import type { RawTable, RawXer } from "./reader.js";

export type TaskStatus = "not_started" | "in_progress" | "completed";
export type TaskType = "task" | "start_milestone" | "finish_milestone" | "level_of_effort" | "wbs_summary" | "resource_dependent";
export type RelationshipType = "FS" | "SS" | "FF" | "SF";
export type PercentCompleteType = "physical" | "duration" | "units";

export interface Project {
  id: string;
  shortName: string;
  /** P6 "data date": progress is reported as of this moment. */
  dataDate: string | null;
  plannedStart: string | null;
  /** "Must finish by" date, if the planner set one. */
  mustFinishBy: string | null;
  /** Finish date calculated by the last schedule run. */
  scheduledFinish: string | null;
  /** How P6 marks activities as critical in this project. */
  criticalPathType: "total_float" | "longest_path";
  /** With "total_float": activities with total float <= this are critical. */
  criticalFloatHrs: number;
  /** Working hours per day of the project calendar, or null when the file doesn't say. */
  calendarHoursPerDay: number | null;
}

export interface Wbs {
  id: string;
  projectId: string;
  parentId: string | null;
  code: string;
  name: string;
  isProjectNode: boolean;
}

export interface Task {
  id: string;
  projectId: string;
  wbsId: string | null;
  code: string;
  name: string;
  type: TaskType;
  status: TaskStatus;
  percentCompleteType: PercentCompleteType;
  physicalPercent: number;
  /** Durations and floats are stored by P6 in hours. */
  plannedDurationHrs: number | null;
  remainingDurationHrs: number | null;
  totalFloatHrs: number | null;
  freeFloatHrs: number | null;
  actualStart: string | null;
  actualFinish: string | null;
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  baselineStart: string | null;
  baselineFinish: string | null;
  onDrivingPath: boolean;
}

export interface Relationship {
  id: string;
  successorId: string;
  predecessorId: string;
  type: RelationshipType;
  lagHrs: number;
}

export interface Schedule {
  projects: Project[];
  wbs: Wbs[];
  tasks: Task[];
  relationships: Relationship[];
}

const STATUS: Record<string, TaskStatus> = {
  TK_NotStart: "not_started",
  TK_Active: "in_progress",
  TK_Complete: "completed",
};

const TASK_TYPE: Record<string, TaskType> = {
  TT_Task: "task",
  TT_Mile: "start_milestone",
  TT_FinMile: "finish_milestone",
  TT_LOE: "level_of_effort",
  TT_WBS: "wbs_summary",
  TT_Rsrc: "resource_dependent",
};

const REL_TYPE: Record<string, RelationshipType> = {
  PR_FS: "FS",
  PR_SS: "SS",
  PR_FF: "FF",
  PR_SF: "SF",
};

const PCT_TYPE: Record<string, PercentCompleteType> = {
  CP_Phys: "physical",
  CP_Drtn: "duration",
  CP_Units: "units",
};

const REQUIRED_FIELDS: Record<string, string[]> = {
  PROJECT: ["proj_id", "proj_short_name"],
  TASK: ["task_id", "proj_id", "task_code", "task_name", "status_code", "task_type"],
  TASKPRED: ["task_pred_id", "task_id", "pred_task_id", "pred_type"],
  PROJWBS: ["wbs_id", "proj_id", "wbs_short_name", "wbs_name"],
};

/** Converts one row's values, reporting anything that cannot be converted. */
class RowReader {
  constructor(
    private readonly table: RawTable,
    private readonly row: Record<string, string>,
    private readonly line: number,
    private readonly issues: IssueList,
  ) {}

  str(field: string): string {
    return (this.row[field] ?? "").trim();
  }

  optStr(field: string): string | null {
    const v = this.str(field);
    return v === "" ? null : v;
  }

  /** Required text value; reports an error when empty. */
  req(field: string): string {
    const v = this.str(field);
    if (v === "") this.fail("MISSING_VALUE", field, `Required value '${field}' is empty.`);
    return v;
  }

  /** Number or null when empty. Reports values like "12,5" or "abc". */
  num(field: string): number | null {
    const v = this.str(field);
    if (v === "") return null;
    if (!/^-?\d+(\.\d+)?$/.test(v)) {
      this.fail("BAD_NUMBER", field, `'${v}' is not a valid number.`);
      return null;
    }
    return Number(v);
  }

  /** XER dates look like "2024-03-18 08:00". Returned as "2024-03-18T08:00:00". */
  date(field: string): string | null {
    const v = this.str(field);
    if (v === "") return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
    if (!m) {
      this.fail("BAD_DATE", field, `'${v}' is not a valid date (expected YYYY-MM-DD HH:MM).`);
      return null;
    }
    const [, y, mo, d, hh = "00", mi = "00", ss = "00"] = m;
    const iso = `${y}-${mo}-${d}T${hh}:${mi}:${ss}`;
    const check = new Date(`${iso}Z`);
    if (
      Number.isNaN(check.getTime()) ||
      check.getUTCFullYear() !== Number(y) ||
      check.getUTCMonth() + 1 !== Number(mo) ||
      check.getUTCDate() !== Number(d) ||
      Number(hh) > 23 ||
      Number(mi) > 59
    ) {
      this.fail("BAD_DATE", field, `'${v}' is not a real calendar date.`);
      return null;
    }
    return iso;
  }

  enumValue<T>(field: string, map: Record<string, T>, severity: "error" | "warning" = "error"): T | null {
    const v = this.str(field);
    const mapped = map[v];
    if (mapped === undefined) {
      const msg = `Unknown value '${v}'. Expected one of: ${Object.keys(map).join(", ")}.`;
      if (severity === "error") this.fail("UNKNOWN_VALUE", field, msg);
      else this.issues.warning("UNKNOWN_VALUE", msg, this.ctx(field));
      return null;
    }
    return mapped;
  }

  ctx(field?: string) {
    return { line: this.line, table: this.table.name, field };
  }

  fail(code: string, field: string, message: string): void {
    this.issues.error(code, message, this.ctx(field));
  }
}

function rowsOf(table: RawTable, issues: IssueList, fn: (r: RowReader) => void): void {
  table.rows.forEach((row, idx) => fn(new RowReader(table, row, table.rowLines[idx] ?? table.line, issues)));
}

function checkRequiredFields(table: RawTable, issues: IssueList): boolean {
  const missing = (REQUIRED_FIELDS[table.name] ?? []).filter((f) => !table.fields.includes(f));
  if (missing.length > 0) {
    issues.error(
      "MISSING_COLUMNS",
      `Table ${table.name} is missing required columns: ${missing.join(", ")}.`,
      { line: table.line, table: table.name },
    );
    return false;
  }
  return true;
}

export function buildSchedule(raw: RawXer): { schedule: Schedule; issues: IssueList } {
  const issues = new IssueList();
  const schedule: Schedule = { projects: [], wbs: [], tasks: [], relationships: [] };

  const projectTable = raw.tables.get("PROJECT");
  const taskTable = raw.tables.get("TASK");
  const wbsTable = raw.tables.get("PROJWBS");
  const predTable = raw.tables.get("TASKPRED");

  if (!projectTable || projectTable.rows.length === 0) {
    issues.error("NO_PROJECT", "The file has no project (PROJECT table missing or empty).");
  }
  if (!taskTable || taskTable.rows.length === 0) {
    issues.error("NO_TASKS", "The file has no activities (TASK table missing or empty).");
  }
  if (issues.hasErrors) return { schedule, issues };

  for (const t of [projectTable, taskTable, wbsTable, predTable]) {
    if (t && !checkRequiredFields(t, issues)) return { schedule, issues };
  }

  // ---- Calendars (only to learn the project's working hours per day) ---------
  const hoursPerDay = new Map<string, number>();
  const calTable = raw.tables.get("CALENDAR");
  if (calTable?.fields.includes("clndr_id") && calTable.fields.includes("day_hr_cnt")) {
    rowsOf(calTable, issues, (r) => {
      const h = r.num("day_hr_cnt");
      if (h !== null && h > 0 && h <= 24) hoursPerDay.set(r.str("clndr_id"), h);
    });
  }

  // ---- Projects -------------------------------------------------------------
  const projectIds = new Set<string>();
  rowsOf(projectTable!, issues, (r) => {
    const id = r.req("proj_id");
    if (projectIds.has(id)) r.fail("DUPLICATE_ID", "proj_id", `Project id ${id} appears twice.`);
    projectIds.add(id);
    schedule.projects.push({
      id,
      shortName: r.req("proj_short_name"),
      dataDate: r.date("last_recalc_date"),
      plannedStart: r.date("plan_start_date"),
      mustFinishBy: r.date("plan_end_date"),
      scheduledFinish: r.date("scd_end_date"),
      criticalPathType: r.str("critical_path_type") === "CT_DrivPath" ? "longest_path" : "total_float",
      criticalFloatHrs: r.num("critical_drtn_hr_cnt") ?? 0,
      calendarHoursPerDay: hoursPerDay.get(r.str("clndr_id")) ?? null,
    });
  });

  // ---- WBS ------------------------------------------------------------------
  const wbsIds = new Set<string>();
  if (wbsTable) {
    rowsOf(wbsTable, issues, (r) => {
      const id = r.req("wbs_id");
      const projectId = r.req("proj_id");
      if (!projectIds.has(projectId)) {
        // WBS rows of projects that were not exported are common; skip them.
        issues.warning("WBS_OTHER_PROJECT", `WBS ${id} belongs to project ${projectId}, which is not in this file. Skipped.`, r.ctx("proj_id"));
        return;
      }
      wbsIds.add(id);
      schedule.wbs.push({
        id,
        projectId,
        parentId: r.optStr("parent_wbs_id"),
        code: r.req("wbs_short_name"),
        name: r.str("wbs_name"),
        isProjectNode: r.str("proj_node_flag") === "Y",
      });
    });
  }

  // ---- Tasks ----------------------------------------------------------------
  const taskIds = new Set<string>();
  rowsOf(taskTable!, issues, (r) => {
    const id = r.req("task_id");
    const projectId = r.req("proj_id");
    if (taskIds.has(id)) r.fail("DUPLICATE_ID", "task_id", `Activity id ${id} appears twice.`);
    if (projectId && !projectIds.has(projectId)) {
      r.fail("UNKNOWN_PROJECT", "proj_id", `Activity ${r.str("task_code")} belongs to project ${projectId}, which is not in the PROJECT table.`);
    }
    taskIds.add(id);

    let wbsId = r.optStr("wbs_id");
    if (wbsId && wbsTable && !wbsIds.has(wbsId)) {
      issues.warning("UNKNOWN_WBS", `Activity ${r.str("task_code")} points to WBS ${wbsId}, which is not in the file.`, r.ctx("wbs_id"));
      wbsId = null;
    }

    const status = r.enumValue("status_code", STATUS);
    const type = r.enumValue("task_type", TASK_TYPE, "warning");
    const pctType = r.optStr("complete_pct_type") ? r.enumValue("complete_pct_type", PCT_TYPE, "warning") : null;
    const pct = r.num("phys_complete_pct") ?? 0;
    if (pct < 0 || pct > 100) r.fail("OUT_OF_RANGE", "phys_complete_pct", `Percent complete ${pct} is outside 0-100.`);

    const task: Task = {
      id,
      projectId,
      wbsId,
      code: r.req("task_code"),
      name: r.str("task_name"),
      type: type ?? "task",
      status: status ?? "not_started",
      percentCompleteType: pctType ?? "duration",
      physicalPercent: pct,
      plannedDurationHrs: r.num("target_drtn_hr_cnt"),
      remainingDurationHrs: r.num("remain_drtn_hr_cnt"),
      totalFloatHrs: r.num("total_float_hr_cnt"),
      freeFloatHrs: r.num("free_float_hr_cnt"),
      actualStart: r.date("act_start_date"),
      actualFinish: r.date("act_end_date"),
      earlyStart: r.date("early_start_date"),
      earlyFinish: r.date("early_end_date"),
      lateStart: r.date("late_start_date"),
      lateFinish: r.date("late_end_date"),
      baselineStart: r.date("target_start_date"),
      baselineFinish: r.date("target_end_date"),
      onDrivingPath: r.str("driving_path_flag") === "Y",
    };

    // Data-quality checks: the file is valid, but the progress looks wrong.
    if (task.status === "completed" && !task.actualFinish) {
      issues.warning("COMPLETED_NO_FINISH", `Activity ${task.code} is completed but has no actual finish date.`, r.ctx("act_end_date"));
    }
    if (task.status !== "not_started" && !task.actualStart) {
      issues.warning("STARTED_NO_START", `Activity ${task.code} is ${task.status.replace("_", " ")} but has no actual start date.`, r.ctx("act_start_date"));
    }
    if (task.status === "not_started" && (task.actualStart || task.actualFinish)) {
      issues.warning("NOT_STARTED_WITH_ACTUALS", `Activity ${task.code} is not started but has actual dates.`, r.ctx("status_code"));
    }

    schedule.tasks.push(task);
  });

  // ---- Relationships --------------------------------------------------------
  if (predTable) {
    const relIds = new Set<string>();
    rowsOf(predTable, issues, (r) => {
      const id = r.req("task_pred_id");
      const successorId = r.req("task_id");
      const predecessorId = r.req("pred_task_id");
      const type = r.enumValue("pred_type", REL_TYPE);
      const lagHrs = r.num("lag_hr_cnt") ?? 0;
      if (relIds.has(id)) r.fail("DUPLICATE_ID", "task_pred_id", `Relationship id ${id} appears twice.`);
      relIds.add(id);

      const missing = [successorId, predecessorId].filter((t) => t && !taskIds.has(t));
      if (missing.length > 0) {
        // A link to an activity in another project that was not exported is
        // normal in P6; a link to a missing activity of the same project is not.
        const predProject = r.str("pred_proj_id");
        const external = predProject !== "" && !projectIds.has(predProject);
        if (external) {
          issues.warning("EXTERNAL_RELATIONSHIP", `Relationship ${id} links to an activity in project ${predProject}, which is not in this file. Skipped.`, r.ctx("pred_task_id"));
        } else {
          r.fail("DANGLING_RELATIONSHIP", "task_id", `Relationship ${id} points to activity id(s) ${missing.join(", ")} that do not exist in the file.`);
        }
        return;
      }
      if (successorId === predecessorId) {
        r.fail("SELF_RELATIONSHIP", "pred_task_id", `Relationship ${id} links activity ${successorId} to itself.`);
        return;
      }
      if (type) schedule.relationships.push({ id, successorId, predecessorId, type, lagHrs });
    });
  }

  return { schedule, issues };
}
