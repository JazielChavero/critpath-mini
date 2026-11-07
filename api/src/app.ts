/**
 * The HTTP API. buildApp() returns a Fastify instance without starting it,
 * so tests can call routes directly with app.inject().
 *
 *   GET  /health                     no login
 *   POST /auth/login                 { email, password } -> { token }
 *   GET  /updates                    uploaded schedule updates, newest first
 *   POST /updates                    multipart upload, field "file" (.xer)
 *   GET  /updates/:id/metrics        metrics + formula table
 *   GET  /updates/:id/warnings       warnings found while importing
 */
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import type pg from "pg";
import { DUMMY_HASH, verifyPassword } from "./auth/passwords.js";
import { importXer } from "./db/importSchedule.js";
import { loadSchedule } from "./db/loadSchedule.js";
import { computeMetrics } from "./metrics/compute.js";
import { METRICS } from "./metrics/definitions.js";

export interface AppOptions {
  pool: pg.Pool;
  jwtSecret: string;
  /** Upload size limit in bytes (default 50 MB). */
  maxUploadBytes?: number;
  logger?: boolean;
}

/** Encodings a user may force on upload (P6 exports in the Windows code page). */
const ALLOWED_ENCODINGS = ["utf-8", "windows-1250", "windows-1251", "windows-1252", "windows-1253", "windows-1254", "windows-1255", "windows-1256"];

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: number; email: string };
    user: { sub: number; email: string };
  }
}

export async function buildApp(opts: AppOptions) {
  if (!opts.jwtSecret || opts.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long.");
  }
  const { pool } = opts;
  const app = Fastify({ logger: opts.logger ?? false });

  await app.register(fastifyJwt, { secret: opts.jwtSecret, sign: { expiresIn: "12h" } });
  await app.register(fastifyMultipart, { limits: { fileSize: opts.maxUploadBytes ?? 50 * 1024 * 1024, files: 1 } });

  const requireUser = async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "Please log in." });
    }
  };

  const parseId = (raw: string, reply: FastifyReply): number | null => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      reply.code(400).send({ error: "Invalid id." });
      return null;
    }
    return id;
  };

  app.get("/health", async () => ({ ok: true }));

  // ---- Auth -------------------------------------------------------------------
  app.post<{ Body: { email?: unknown; password?: unknown } }>("/auth/login", async (req, reply) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return reply.code(400).send({ error: "Email and password are required." });
    }
    const { rows } = await pool.query<{ id: number; email: string; password_hash: string }>(
      "SELECT id, email, password_hash FROM users WHERE email = lower($1)",
      [email.trim()],
    );
    const user = rows[0];
    // Always run one password check so unknown emails take as long as wrong passwords.
    const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !valid) return reply.code(401).send({ error: "Wrong email or password." });
    return { token: app.jwt.sign({ sub: user.id, email: user.email }) };
  });

  // ---- Schedule updates ----------------------------------------------------
  app.get("/updates", { preHandler: requireUser }, async () => {
    const { rows } = await pool.query(
      `SELECT u.id, u.file_name, u.uploaded_at, u.p6_version, u.warning_count,
              p.short_name AS project, to_char(p.data_date, 'YYYY-MM-DD"T"HH24:MI:SS') AS data_date,
              (SELECT count(*)::int FROM tasks t WHERE t.update_id = u.id) AS activities
         FROM schedule_updates u
         LEFT JOIN LATERAL (SELECT short_name, data_date FROM projects WHERE update_id = u.id ORDER BY p6_id LIMIT 1) p ON true
        ORDER BY u.id DESC`,
    );
    return { updates: rows };
  });

  app.post<{ Querystring: { encoding?: string } }>("/updates", { preHandler: requireUser }, async (req, reply) => {
    const encoding = req.query.encoding;
    if (encoding && !ALLOWED_ENCODINGS.includes(encoding)) {
      return reply.code(400).send({ error: `Unsupported encoding. Use one of: ${ALLOWED_ENCODINGS.join(", ")}.` });
    }
    if (!req.isMultipart()) {
      return reply.code(400).send({ error: "Send the schedule as multipart/form-data in a field named 'file'." });
    }
    const file = await req.file();
    if (!file || file.fieldname !== "file") {
      return reply.code(400).send({ error: "Missing file. Send it in a field named 'file'." });
    }
    let buf: Buffer;
    try {
      buf = await file.toBuffer();
    } catch (err) {
      if ((err as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
        return reply.code(413).send({ error: "The file is too large." });
      }
      throw err;
    }

    const result = await importXer(pool, file.filename || "schedule.xer", buf, {
      uploadedBy: req.user.sub,
      encoding,
    });
    if (result.ok) {
      return reply.code(201).send({
        updateId: result.updateId,
        activities: result.tasks,
        relationships: result.relationships,
        warnings: result.warnings,
      });
    }
    if (result.reason === "duplicate") {
      return reply.code(409).send({
        error: `This exact file was already uploaded (update #${result.existingUpdateId}).`,
        existingUpdateId: result.existingUpdateId,
      });
    }
    return reply.code(422).send({
      error: "The file could not be imported. Nothing was saved.",
      errors: result.errors,
      warnings: result.warnings,
    });
  });

  app.get<{ Params: { id: string } }>("/updates/:id/metrics", { preHandler: requireUser }, async (req, reply) => {
    const id = parseId(req.params.id, reply);
    if (id === null) return;
    const update = await pool.query(
      "SELECT id, file_name, uploaded_at, p6_version, encoding, warning_count FROM schedule_updates WHERE id = $1",
      [id],
    );
    if (!update.rows[0]) return reply.code(404).send({ error: "Update not found." });

    const s = await loadSchedule(pool, id);
    return {
      update: update.rows[0],
      definitions: METRICS,
      projects: s.projects.map((p) => computeMetrics(p, s.tasks, s.relationships)),
    };
  });

  app.get<{ Params: { id: string } }>("/updates/:id/warnings", { preHandler: requireUser }, async (req, reply) => {
    const id = parseId(req.params.id, reply);
    if (id === null) return;
    const { rows } = await pool.query(
      `SELECT code, message, line, table_name AS table, field FROM import_warnings
        WHERE update_id = $1 ORDER BY line NULLS FIRST, id LIMIT 500`,
      [id],
    );
    return { warnings: rows };
  });

  return app;
}
