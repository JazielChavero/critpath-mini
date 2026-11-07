/**
 * Starts the API.  npm run dev  (reloads on change)  /  npm start
 * Needs DATABASE_URL and JWT_SECRET (see .env.example).
 */
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { createPool, migrate } from "./db/importSchedule.js";

const pool = createPool();
await migrate(pool);

const app = await buildApp({
  pool,
  jwtSecret: process.env.JWT_SECRET ?? "",
  logger: true,
  webDir: fileURLToPath(new URL("../../web/dist", import.meta.url)),
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: process.env.HOST ?? "127.0.0.1" });
