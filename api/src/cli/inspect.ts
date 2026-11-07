/**
 * Usage: npm run inspect -- path/to/file.xer
 * Parses a file and prints a summary, or the reasons it was rejected.
 */
import { readFileSync } from "node:fs";
import { formatIssue, parseXer, type Issue } from "../xer/index.js";

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run inspect -- <file.xer>");
  process.exit(2);
}

const result = parseXer(readFileSync(path));

function printIssues(title: string, list: Issue[], max = 15): void {
  if (list.length === 0) return;
  const byCode = new Map<string, number>();
  for (const i of list) byCode.set(i.code, (byCode.get(i.code) ?? 0) + 1);
  console.log(`\n${title}: ${list.length} (${[...byCode].map(([c, n]) => `${c}×${n}`).join(", ")})`);
  list.slice(0, max).forEach((i) => console.log("  " + formatIssue(i)));
  if (list.length > max) console.log(`  ... and ${list.length - max} more`);
}

if (!result.ok) {
  console.log(`REJECTED: ${path}`);
  printIssues("Errors", result.errors);
  printIssues("Warnings", result.warnings, 5);
  process.exit(1);
}

const { schedule: s, header, encoding } = result;
console.log(`OK: ${path}`);
console.log(`P6 version ${header.version}, exported ${header.exportDate}, encoding ${encoding}`);
for (const p of s.projects) {
  const tasks = s.tasks.filter((t) => t.projectId === p.id);
  const count = (st: string) => tasks.filter((t) => t.status === st).length;
  console.log(
    `Project ${p.shortName} (id ${p.id}) — data date ${p.dataDate ?? "n/a"}, scheduled finish ${p.scheduledFinish ?? "n/a"}`,
  );
  console.log(
    `  ${tasks.length} activities: ${count("completed")} completed, ${count("in_progress")} in progress, ${count("not_started")} not started`,
  );
}
console.log(`${s.wbs.length} WBS nodes, ${s.relationships.length} relationships`);
printIssues("Warnings", result.warnings, 5);
