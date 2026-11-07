/**
 * Saves a parsed schedule to PostgreSQL.
 *
 * Everything happens in one transaction: either the whole file is saved,
 * or nothing is (no half-imported schedules).
 * Rows are inserted in bulk with UNNEST so a 7,000-activity file is one query
 * per table instead of thousands.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseXer, type Issue } from "../xer/index.js";

export type ImportResult =
  | { ok: true; updateId: number; tasks: number; relationships: number; warnings: Issue[] }
  | { ok: false; reason: "invalid_file"; errors: Issue[]; warnings: Issue[] }
  | { ok: false; reason: "duplicate"; existingUpdateId: number };

export function createPool(): pg.Pool {
  return new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/critpath" });
}

export async function migrate(pool: pg.Pool): Promise<void> {
  const sql = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  await pool.query(sql);
}

export async function importXer(pool: pg.Pool, fileName: string, buf: Uint8Array): Promise<ImportResult> {
  const parsed = parseXer(buf);
  if (!parsed.ok) return { ok: false, reason: "invalid_file", errors: parsed.errors, warnings: parsed.warnings };

  const sha = createHash("sha256").update(buf).digest("hex");
  const existing = await pool.query<{ id: number }>("SELECT id FROM schedule_updates WHERE file_sha256 = $1", [sha]);
  if (existing.rows[0]) return { ok: false, reason: "duplicate", existingUpdateId: existing.rows[0].id };

  const { schedule: s, header, encoding, warnings } = parsed;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO schedule_updates (file_name, file_sha256, p6_version, exported_on, encoding, warning_count)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [fileName, sha, header.version, header.exportDate, encoding, warnings.length],
    );
    const updateId = rows[0]!.id;

    await client.query(
      `INSERT INTO projects (update_id, p6_id, short_name, data_date, planned_start, must_finish_by, scheduled_finish)
       SELECT $1, * FROM unnest($2::text[], $3::text[], $4::timestamp[], $5::timestamp[], $6::timestamp[], $7::timestamp[])`,
      [
        updateId,
        s.projects.map((p) => p.id),
        s.projects.map((p) => p.shortName),
        s.projects.map((p) => p.dataDate),
        s.projects.map((p) => p.plannedStart),
        s.projects.map((p) => p.mustFinishBy),
        s.projects.map((p) => p.scheduledFinish),
      ],
    );

    await client.query(
      `INSERT INTO wbs (update_id, p6_id, project_p6_id, parent_p6_id, code, name, is_project_node)
       SELECT $1, * FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::boolean[])`,
      [
        updateId,
        s.wbs.map((w) => w.id),
        s.wbs.map((w) => w.projectId),
        s.wbs.map((w) => w.parentId),
        s.wbs.map((w) => w.code),
        s.wbs.map((w) => w.name),
        s.wbs.map((w) => w.isProjectNode),
      ],
    );

    const t = s.tasks;
    await client.query(
      `INSERT INTO tasks (update_id, p6_id, project_p6_id, wbs_p6_id, code, name, type, status, percent_complete_type,
         physical_percent, planned_duration_hrs, remaining_duration_hrs, total_float_hrs, free_float_hrs,
         actual_start, actual_finish, early_start, early_finish, late_start, late_finish, baseline_start, baseline_finish,
         on_driving_path)
       SELECT $1, * FROM unnest(
         $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[],
         $10::numeric[], $11::numeric[], $12::numeric[], $13::numeric[], $14::numeric[],
         $15::timestamp[], $16::timestamp[], $17::timestamp[], $18::timestamp[], $19::timestamp[], $20::timestamp[],
         $21::timestamp[], $22::timestamp[], $23::boolean[])`,
      [
        updateId,
        t.map((x) => x.id), t.map((x) => x.projectId), t.map((x) => x.wbsId), t.map((x) => x.code),
        t.map((x) => x.name), t.map((x) => x.type), t.map((x) => x.status), t.map((x) => x.percentCompleteType),
        t.map((x) => x.physicalPercent), t.map((x) => x.plannedDurationHrs), t.map((x) => x.remainingDurationHrs),
        t.map((x) => x.totalFloatHrs), t.map((x) => x.freeFloatHrs),
        t.map((x) => x.actualStart), t.map((x) => x.actualFinish), t.map((x) => x.earlyStart), t.map((x) => x.earlyFinish),
        t.map((x) => x.lateStart), t.map((x) => x.lateFinish), t.map((x) => x.baselineStart), t.map((x) => x.baselineFinish),
        t.map((x) => x.onDrivingPath),
      ],
    );

    const r = s.relationships;
    await client.query(
      `INSERT INTO relationships (update_id, p6_id, successor_p6_id, predecessor_p6_id, type, lag_hrs)
       SELECT $1, * FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[])`,
      [updateId, r.map((x) => x.id), r.map((x) => x.successorId), r.map((x) => x.predecessorId), r.map((x) => x.type), r.map((x) => x.lagHrs)],
    );

    if (warnings.length > 0) {
      await client.query(
        `INSERT INTO import_warnings (update_id, code, message, line, table_name, field)
         SELECT $1, * FROM unnest($2::text[], $3::text[], $4::int[], $5::text[], $6::text[])`,
        [
          updateId,
          warnings.map((w) => w.code), warnings.map((w) => w.message), warnings.map((w) => w.line ?? null),
          warnings.map((w) => w.table ?? null), warnings.map((w) => w.field ?? null),
        ],
      );
    }

    await client.query("COMMIT");
    return { ok: true, updateId, tasks: t.length, relationships: r.length, warnings };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
