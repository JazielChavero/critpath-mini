/**
 * Creates (or resets the password of) a user who can log in.
 * Usage: npm run create-user -- someone@example.com
 * The password is typed at a prompt (visible on screen) so it doesn't end up in your shell history.
 */
import { createInterface } from "node:readline/promises";
import { hashPassword } from "../auth/passwords.js";
import { createPool, migrate } from "../db/importSchedule.js";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Usage: npm run create-user -- <email>");
  process.exit(2);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question("Password (min. 10 characters): ");
rl.close();
if (password.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(2);
}

const pool = createPool();
try {
  await migrate(pool);
  const { rows } = await pool.query<{ inserted: boolean }>(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING (xmax = 0) AS inserted`,
    [email, await hashPassword(password)],
  );
  console.log(rows[0]?.inserted ? `User ${email} created.` : `Password for ${email} updated.`);
} finally {
  await pool.end();
}
