/**
 * API tests against the disposable test database (TEST_DATABASE_URL).
 * Requests go through app.inject(), no real network involved.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/passwords.js";
import { migrate } from "../src/db/importSchedule.js";
import { DEFAULT_TASKS, xer } from "./fixtures.js";

const url = process.env.TEST_DATABASE_URL;

/** Builds a multipart/form-data body by hand, like a browser upload. */
function multipart(content: string | Uint8Array, filename = "torre-a.xer", field = "file") {
  const boundary = "----critpath" + Math.random().toString(16).slice(2);
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`,
    ),
    Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload: body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

describe.skipIf(!url)("HTTP API", () => {
  let pool: pg.Pool;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;
  const auth = () => ({ authorization: `Bearer ${token}` });
  const upload = (content: string | Uint8Array, o: { filename?: string; field?: string; query?: string } = {}) => {
    const m = multipart(content, o.filename, o.field);
    return app.inject({ method: "POST", url: `/api/updates${o.query ?? ""}`, payload: m.payload, headers: { ...m.headers, ...auth() } });
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await migrate(pool);
    await pool.query("TRUNCATE schedule_updates, users RESTART IDENTITY CASCADE");
    await pool.query("INSERT INTO users (email, password_hash) VALUES ($1, $2)", [
      "jaziel@example.com",
      await hashPassword("correct horse battery"),
    ]);
    app = await buildApp({ pool, jwtSecret: "x".repeat(40), maxUploadBytes: 1024 * 1024 });
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  describe("login", () => {
    it("rejects a wrong password and an unknown email with the same message", async () => {
      const wrong = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "jaziel@example.com", password: "nope" } });
      const unknown = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "who@example.com", password: "nope" } });
      expect(wrong.statusCode).toBe(401);
      expect(unknown.statusCode).toBe(401);
      expect(wrong.json()).toEqual(unknown.json());
    });

    it("returns a token for the right password (email is case-insensitive)", async () => {
      const r = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "Jaziel@Example.com", password: "correct horse battery" },
      });
      expect(r.statusCode).toBe(200);
      token = r.json().token;
      expect(token).toMatch(/^ey/);
    });

    it("protects every data route", async () => {
      for (const u of ["/api/updates", "/api/updates/1/metrics", "/api/updates/1/warnings"]) {
        const r = await app.inject({ method: "GET", url: u });
        expect(r.statusCode, u).toBe(401);
      }
      const bad = await app.inject({ method: "GET", url: "/api/updates", headers: { authorization: "Bearer forged.token.here" } });
      expect(bad.statusCode).toBe(401);
    });
  });

  describe("uploads", () => {
    it("imports a valid file", async () => {
      const r = await upload(xer());
      expect(r.statusCode).toBe(201);
      expect(r.json()).toMatchObject({ updateId: 1, activities: 2, relationships: 1, warnings: [] });
    });

    it("refuses the same file twice", async () => {
      const r = await upload(xer(), { filename: "copy.xer" });
      expect(r.statusCode).toBe(409);
      expect(r.json().existingUpdateId).toBe(1);
    });

    it("accepts the same file again when read with a different encoding", async () => {
      const r = await upload(xer(), { filename: "torre-a-1256.xer", query: "?encoding=windows-1256" });
      expect(r.statusCode).toBe(201);
      expect(r.json().updateId).toBe(2);
      const again = await upload(xer(), { query: "?encoding=windows-1256" });
      expect(again.statusCode).toBe(409);
    });

    it("explains why a broken file was rejected, with the line number", async () => {
      const broken = DEFAULT_TASKS.slice();
      broken[3] = broken[3]!.replace("\t40\t", "\t4O\t");
      const r = await upload(xer({ tasks: broken }));
      expect(r.statusCode).toBe(422);
      expect(r.json().errors).toEqual([
        expect.objectContaining({ code: "BAD_NUMBER", line: 12, table: "TASK", field: "phys_complete_pct" }),
      ]);
    });

    it("rejects files that are too large", async () => {
      const r = await upload(new Uint8Array(2 * 1024 * 1024));
      expect(r.statusCode).toBe(413);
    });

    it("rejects a request without a file field", async () => {
      const r = await upload(xer(), { field: "other" });
      expect(r.statusCode).toBe(400);
    });

    it("rejects an unsupported encoding", async () => {
      const r = await upload(xer(), { query: "?encoding=klingon" });
      expect(r.statusCode).toBe(400);
    });

    it("lists uploads", async () => {
      const r = await app.inject({ method: "GET", url: "/api/updates", headers: auth() });
      expect(r.json().updates).toEqual([
        expect.objectContaining({ id: 2, file_name: "torre-a-1256.xer" }),
        expect.objectContaining({ id: 1, file_name: "torre-a.xer", project: "TORRE-A", data_date: "2024-03-01T00:00:00", activities: 2 }),
      ]);
    });
  });

  describe("metrics", () => {
    it("computes metrics from what was stored", async () => {
      const r = await app.inject({ method: "GET", url: "/api/updates/1/metrics", headers: auth() });
      expect(r.statusCode).toBe(200);
      const body = r.json();
      expect(body.definitions.length).toBeGreaterThan(10);
      expect(body.projects[0].values).toMatchObject({
        total_activities: 2,
        completed: 1,
        in_progress: 1,
        critical_activities: 1,
        percent_complete_duration: 70, // (80 + 32) / 160
        data_date: "2024-03-01T00:00:00",
      });
    });

    it("404 for an update that does not exist, 400 for a bad id", async () => {
      expect((await app.inject({ method: "GET", url: "/api/updates/999/metrics", headers: auth() })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: "/api/updates/abc/metrics", headers: auth() })).statusCode).toBe(400);
    });
  });
});
