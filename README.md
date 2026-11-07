# CritPath Mini

A small learning project: upload a Primavera P6 schedule (`.xer`), get trustworthy
metrics and a written summary that never invents a number.

**Status — day 2 of 5:** XER parser, PostgreSQL import, metrics and the HTTP API
(login, upload, metrics) are done. Dashboard, AI summary and AWS deployment come next.

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

## Metrics

Every number comes from the formula table in `api/src/metrics/definitions.ts`
(duration % complete, critical and negative-float activities, late starts/finishes,
missing logic, baseline vs. forecast finish, ...), computed by a pure function.

`tools/independent_metrics.py` re-implements the same table in Python with its own
XER reader and shares no code with the app. Both produce identical values for all
three sample files, and those values are the golden tests in `tests/metrics.test.ts`.

Known limitations:
- Floats are converted to days with the project calendar's hours per day; when the
  file doesn't include it (older P6 versions), 8 h/day is assumed and flagged.
- XER files don't declare their encoding. Detection is UTF-8, then Windows-1252;
  an upload can force another one (e.g. `?encoding=windows-1256` for Arabic names).
  Numbers, dates and codes are ASCII, so this only ever affects names.

## API

| Method | Path | |
|---|---|---|
| GET | `/health` | no login |
| POST | `/auth/login` | `{ email, password }` → `{ token }` (12 h) |
| GET | `/updates` | uploaded schedule updates |
| POST | `/updates` | multipart, field `file`; 201 / 409 duplicate / 413 too large / 422 with every error |
| GET | `/updates/:id/metrics` | metrics per project + the formula table |
| GET | `/updates/:id/warnings` | warnings found on import |

Passwords are hashed with scrypt; unknown emails and wrong passwords get the same
answer in the same time.

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

npm test                           # all tests (DB/API tests run if TEST_DATABASE_URL is set)
npm run inspect -- samples/airport.xer
npm run import  -- samples/*.xer   # import from the command line

npm run create-user -- you@example.com
npm run dev                        # API on http://localhost:3000
```

## Layout

```
api/
  src/xer/reader.ts         layer 1: file structure
  src/xer/schedule.ts       layer 2: typed schedule + consistency checks
  src/xer/issues.ts         errors and warnings
  src/db/schema.sql         tables (one "schedule update" per uploaded file)
  src/db/importSchedule.ts  transactional bulk import
  src/metrics/definitions.ts  the formula table
  src/metrics/compute.ts    metrics (pure function)
  src/db/loadSchedule.ts    reads an update back from PostgreSQL
  src/auth/passwords.ts     scrypt hashing
  src/app.ts                HTTP API (Fastify)
  src/cli/                  inspect / import / create-user commands
  tests/                    unit, golden, database and API tests
tools/independent_metrics.py  independent check of the metrics
```
