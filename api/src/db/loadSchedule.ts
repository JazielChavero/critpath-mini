/**
 * Reads one schedule update back from PostgreSQL into the same types the
 * parser produces, so metrics are computed the same way from either source.
 *
 * Dates are formatted by PostgreSQL itself (to_char) so the server's or the
 * user's time zone can never shift them.
 */
import type pg from "pg";
import type { Project, Relationship, Task } from "../xer/schedule.js";

const ts = (col: string) => `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS') AS ${col}`;
const num = (v: string | null) => (v === null ? null : Number(v));

export interface StoredSchedule {
  projects: Project[];
  tasks: Task[];
  relationships: Relationship[];
}

export async function loadSchedule(pool: pg.Pool, updateId: number): Promise<StoredSchedule> {
  const [projects, tasks, rels] = await Promise.all([
    pool.query(
      `SELECT p6_id, short_name, ${ts("data_date")}, ${ts("planned_start")}, ${ts("must_finish_by")},
              ${ts("scheduled_finish")}, critical_path_type, critical_float_hrs, calendar_hours_per_day
         FROM projects WHERE update_id = $1 ORDER BY p6_id`,
      [updateId],
    ),
    pool.query(
      `SELECT p6_id, project_p6_id, wbs_p6_id, code, name, type, status, percent_complete_type, physical_percent,
              planned_duration_hrs, remaining_duration_hrs, total_float_hrs, free_float_hrs,
              ${ts("actual_start")}, ${ts("actual_finish")}, ${ts("early_start")}, ${ts("early_finish")},
              ${ts("late_start")}, ${ts("late_finish")}, ${ts("baseline_start")}, ${ts("baseline_finish")},
              on_driving_path
         FROM tasks WHERE update_id = $1`,
      [updateId],
    ),
    pool.query(
      `SELECT p6_id, successor_p6_id, predecessor_p6_id, type, lag_hrs FROM relationships WHERE update_id = $1`,
      [updateId],
    ),
  ]);

  return {
    projects: projects.rows.map((r) => ({
      id: r.p6_id,
      shortName: r.short_name,
      dataDate: r.data_date,
      plannedStart: r.planned_start,
      mustFinishBy: r.must_finish_by,
      scheduledFinish: r.scheduled_finish,
      criticalPathType: r.critical_path_type,
      criticalFloatHrs: Number(r.critical_float_hrs),
      calendarHoursPerDay: num(r.calendar_hours_per_day),
    })),
    tasks: tasks.rows.map((r) => ({
      id: r.p6_id,
      projectId: r.project_p6_id,
      wbsId: r.wbs_p6_id,
      code: r.code,
      name: r.name,
      type: r.type,
      status: r.status,
      percentCompleteType: r.percent_complete_type,
      physicalPercent: Number(r.physical_percent),
      plannedDurationHrs: num(r.planned_duration_hrs),
      remainingDurationHrs: num(r.remaining_duration_hrs),
      totalFloatHrs: num(r.total_float_hrs),
      freeFloatHrs: num(r.free_float_hrs),
      actualStart: r.actual_start,
      actualFinish: r.actual_finish,
      earlyStart: r.early_start,
      earlyFinish: r.early_finish,
      lateStart: r.late_start,
      lateFinish: r.late_finish,
      baselineStart: r.baseline_start,
      baselineFinish: r.baseline_finish,
      onDrivingPath: r.on_driving_path,
    })),
    relationships: rels.rows.map((r) => ({
      id: r.p6_id,
      successorId: r.successor_p6_id,
      predecessorId: r.predecessor_p6_id,
      type: r.type,
      lagHrs: Number(r.lag_hrs),
    })),
  };
}
