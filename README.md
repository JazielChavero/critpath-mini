# CritPath Mini

A small learning project: upload a Primavera P6 schedule (`.xer`), get trustworthy
metrics and a written summary that never invents a number.

**Status — day 1 of 5:** the XER parser and the PostgreSQL import are done.
Metrics, dashboard, AI summary and AWS deployment come next.

## Why the parser is built this way

- **Code, not an LLM.** Every value is read and converted by deterministic code.
- **Two layers.** `reader.ts` only checks the file structure (`%T`, `%F`, `%R`, `%E`)
  and returns tables. `schedule.ts` turns those tables into typed projects,
  activities and relationships and checks they are consistent.
- **Columns by name, never by position.** Column order changes between P6 versions.
- **Errors vs. warnings.** An *error* (truncated row, bad date, link to a missing
  activity...) rejects the file and nothing is saved. A *warning* (an activity marked
  complete without a finish date, a link to another project) is saved and shown.
- **Every problem is reported at once**, with line, table and field.
- **Encoding.** Tries UTF-8 first, falls back to Windows-1252 (the usual P6 export).
- **Atomic import.** One transaction per file; the same file can't be imported twice.

## Checked against real files

The golden tests compare the parser with totals counted by a separate script:

| File | P6 version | Activities | Relationships | Completed | In progress |
|---|---|---|---|---|---|
| airport.xer | 5.0 | 66 | 84 | 0 | 0 |
| sample.xer | 20.12 | 52 | 61 | 0 | 0 |
| rehab-2.xer | 6.0.0 | 6,977 | 10,730 | 2,037 | 176 |

## Run it

Requires Node.js 22+ and PostgreSQL 14+.

```bash
cd api
npm install
cp .env.example .env               # then edit the database URLs

npm test                           # parser tests (DB tests run if TEST_DATABASE_URL is set)
npm run inspect -- samples/airport.xer
npm run import  -- samples/*.xer   # creates the tables and imports
```

## Layout

```
api/
  src/xer/reader.ts         layer 1: file structure
  src/xer/schedule.ts       layer 2: typed schedule + consistency checks
  src/xer/issues.ts         errors and warnings
  src/db/schema.sql         tables (one "schedule update" per uploaded file)
  src/db/importSchedule.ts  transactional bulk import
  src/cli/                  inspect / import commands
  tests/                    unit, golden and database tests
```
