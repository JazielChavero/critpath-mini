/**
 * Usage: DATABASE_URL=postgres://... npm run import -- file1.xer [file2.xer ...]
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createPool, importXer, migrate } from "../db/importSchedule.js";
import { formatIssue } from "../xer/index.js";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: npm run import -- <file.xer> [...]");
  process.exit(2);
}

const pool = createPool();
let failed = false;
try {
  await migrate(pool);
  for (const file of files) {
    const started = Date.now();
    const r = await importXer(pool, basename(file), readFileSync(file));
    if (r.ok) {
      console.log(
        `✔ ${basename(file)} → update #${r.updateId}: ${r.tasks} activities, ${r.relationships} relationships, ` +
          `${r.warnings.length} warnings (${Date.now() - started} ms)`,
      );
    } else if (r.reason === "duplicate") {
      console.log(`• ${basename(file)} was already imported as update #${r.existingUpdateId}; skipped.`);
    } else {
      failed = true;
      console.log(`✘ ${basename(file)} rejected, nothing was saved:`);
      r.errors.slice(0, 10).forEach((e) => console.log("   " + formatIssue(e)));
      if (r.errors.length > 10) console.log(`   ... and ${r.errors.length - 10} more`);
    }
  }
} finally {
  await pool.end();
}
process.exit(failed ? 1 : 0);
