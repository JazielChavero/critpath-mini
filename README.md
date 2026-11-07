# CritPath Mini

A small learning project: upload a Primavera P6 schedule (`.xer`), get trustworthy
metrics and a written summary that never invents a number.

Built in five days as a learning project: XER parser, PostgreSQL import, metrics
checked against an independent implementation, HTTP API, React dashboard
(English/Spanish), an AI summary that cannot invent numbers, and a Docker image
ready for Render or AWS (see [DEPLOY.md](DEPLOY.md)).

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
- **Memory.** Only the five tables the model uses (PROJECT, PROJWBS, TASK, TASKPRED,
  CALENDAR) are kept in memory; every other table is still checked line by line.
  An 18 MB export with 134k resource/code rows parses in under 0.3 s with a peak of
  ~220 MB instead of ~710 MB, so it fits a 512 MB free instance.
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

All routes are under `/api`.

| Method | Path | |
|---|---|---|
| GET | `/health` | no login |
| POST | `/auth/login` | `{ email, password }` → `{ token }` (12 h) |
| GET | `/updates` | uploaded schedule updates |
| POST | `/updates` | multipart, field `file`; 201 / 409 duplicate / 413 too large / 422 with every error |
| GET | `/updates/:id/metrics` | metrics per project + the formula table |
| GET | `/updates/:id/warnings` | warnings found on import |

Security basics: passwords hashed with scrypt; unknown emails and wrong passwords get
the same answer in the same time; 10 login attempts per IP every 15 minutes; upload
size and rate limits; security headers (CSP, no sniffing, frame protection); the AI
service only listens inside the container and requires a shared token.

## Checked against real files

The golden tests compare the parser with totals counted by a separate script:

| File | P6 version | Activities | Relationships | Completed | In progress |
|---|---|---|---|---|---|
| airport.xer | 5.0 | 66 | 84 | 0 | 0 |
| sample.xer | 20.12 | 52 | 61 | 0 | 0 |
| rehab-2.xer | 6.0.0 | 6,977 | 10,730 | 2,037 | 176 |

## Dashboard

React + TypeScript (Vite) in `web/`. It opens with one sentence about the finish date,
then a timeline drawn the way P6 draws it (planned start, dashed data-date line,
baseline vs. forecast finish), progress by status, the metrics as rows (click any
metric to see its formula) and the critical activities. Colours follow the P6 Gantt
convention: red is critical. Works on phones; Arabic/Hebrew names render right-to-left.

In development the dashboard runs on Vite (:5173) and proxies `/api` to the API.
In production the API serves the built dashboard itself, so it is one service.

## AI summary (`ai/`, Python + FastAPI)

The model writes the prose; it never writes a number.

1. The Node API computes the metrics and sends them to the AI service.
2. The service turns every value into a named fact, already formatted
   (`{{critical_activities}}` → "253"). Phrases whose direction matters
   ("0.6 days ahead of the baseline") are built by code too.
3. The model must write numbers, dates, codes and names only as placeholders.
4. A validator rejects any draft with a digit, a number written as a word
   ("two hundred", "doscientos", "half"), an unknown placeholder or a broken one,
   or no mention of the forecast finish. The reasons go back to the model, up to
   3 drafts.
5. Accepted drafts get the placeholders replaced by the computed text. If no draft
   is accepted, or there is no API key, a fixed template is used and the UI says so.

So every number the user reads was put there by our code. Tests prove it, including
one that checks every number in every output against the computed facts. What the
validator cannot check is wording without numbers; the prompt forbids vague
quantifiers ("most", "few") and causes, but that part relies on the model.

Summaries are cached per update, project and language; "Write again" regenerates.

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

cd ../web
npm install
npm run dev                        # dashboard on http://localhost:5173 (development)
npm run build                      # or build it once; the API then serves it on :3000

cd ../ai
python -m venv .venv
.venv/bin/pip install -r requirements.txt     # Windows: .venv\Scripts\pip
cp .env.example .env                          # optional: ANTHROPIC_API_KEY
.venv/bin/python -m pytest
.venv/bin/python -m uvicorn app.main:app --port 8001 --env-file .env
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
ai/
  app/facts.py              computed values -> formatted facts
  app/validate.py           the number check
  app/summarize.py          drafts, retries, fallback
  app/template.py           deterministic summary
  app/writer.py             Claude (Anthropic SDK)
  tests/                    pytest
```
