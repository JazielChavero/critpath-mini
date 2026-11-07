/**
 * Golden tests on real P6 exports.
 *
 * The expected numbers were counted independently (a separate Python script
 * that only counts %R lines per table), not with this parser, so the test
 * checks the parser against an outside source of truth.
 *
 * The sample files are third-party and are NOT committed to the repo.
 * Put them in api/samples/ (see samples/README.md) to run these tests.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseXer } from "../src/xer/index.js";

const DIR = process.env.XER_SAMPLES_DIR ?? join(import.meta.dirname, "..", "samples");

const GOLDEN = [
  { file: "airport.xer", version: "5.0", project: "TERMINAL-2", tasks: 66, relationships: 84, wbs: 26, completed: 0, inProgress: 0 },
  { file: "sample.xer", version: "20.12", project: "Task SE", tasks: 52, relationships: 61, wbs: 6, completed: 0, inProgress: 0 },
  { file: "rehab-2.xer", version: "6.0.0", project: "R111", tasks: 6977, relationships: 10730, wbs: 1, completed: 2037, inProgress: 176 },
];

describe.each(GOLDEN)("real P6 export: $file", (g) => {
  const path = join(DIR, g.file);
  it.skipIf(!existsSync(path))("matches independently counted totals", () => {
    const r = parseXer(readFileSync(path));
    if (!r.ok) throw new Error(r.errors.slice(0, 5).map((e) => e.message).join("\n"));
    const s = r.schedule;
    expect(r.header.version).toBe(g.version);
    expect(s.projects.map((p) => p.shortName)).toEqual([g.project]);
    expect(s.tasks).toHaveLength(g.tasks);
    expect(s.relationships).toHaveLength(g.relationships);
    expect(s.wbs).toHaveLength(g.wbs);
    expect(s.tasks.filter((t) => t.status === "completed")).toHaveLength(g.completed);
    expect(s.tasks.filter((t) => t.status === "in_progress")).toHaveLength(g.inProgress);
  });
});
