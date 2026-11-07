/**
 * Database tests. They need a disposable database:
 *   TEST_DATABASE_URL=postgres://postgres@localhost:5432/critpath_test npm test
 * Skipped when TEST_DATABASE_URL is not set. All tables are emptied first.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importXer, migrate } from "../src/db/importSchedule.js";
import { DEFAULT_TASKS, utf8, xer } from "./fixtures.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("importing into PostgreSQL", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await migrate(pool);
    await pool.query("TRUNCATE schedule_updates RESTART IDENTITY CASCADE");
  });
  afterAll(async () => pool?.end());

  const count = async (table: string) => Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);

  it("saves projects, WBS, activities and relationships with their types", async () => {
    const r = await importXer(pool, "torre-a.xer", utf8(xer()));
    expect(r).toMatchObject({ ok: true, updateId: 1, tasks: 2, relationships: 1 });

    const { rows } = await pool.query(
      "SELECT code, status, physical_percent::float AS pct, total_float_hrs::float AS tf, actual_start FROM tasks ORDER BY code",
    );
    expect(rows).toEqual([
      { code: "A1000", status: "completed", pct: 100, tf: null, actual_start: new Date(2024, 0, 8, 8, 0) },
      { code: "A1010", status: "in_progress", pct: 40, tf: 0, actual_start: new Date(2024, 0, 22, 8, 0) },
    ]);
    expect(await count("projects")).toBe(1);
    expect(await count("wbs")).toBe(2);
    expect(await count("relationships")).toBe(1);
  });

  it("refuses the same file twice", async () => {
    const r = await importXer(pool, "copy.xer", utf8(xer()));
    expect(r).toEqual({ ok: false, reason: "duplicate", existingUpdateId: 1 });
  });

  it("saves nothing at all when the file is broken", async () => {
    const before = await count("tasks");
    const broken = DEFAULT_TASKS.slice();
    broken[3] = broken[3]!.replace("\t40\t", "\t4O\t"); // letter O instead of zero
    const r = await importXer(pool, "broken.xer", utf8(xer({ tasks: broken })));
    expect(r).toMatchObject({ ok: false, reason: "invalid_file" });
    expect(await count("tasks")).toBe(before);
    expect(await count("schedule_updates")).toBe(1);
  });
});
