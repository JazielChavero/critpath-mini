-- Each uploaded XER file is one "schedule update" (usually one per month).
-- Every update keeps its own copy of the activities, so updates can be compared later.

CREATE TABLE IF NOT EXISTS schedule_updates (
  id            SERIAL PRIMARY KEY,
  file_name     TEXT        NOT NULL,
  file_sha256   TEXT        NOT NULL UNIQUE,   -- the same file cannot be imported twice
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  p6_version    TEXT        NOT NULL,
  exported_on   TEXT        NOT NULL,
  encoding      TEXT        NOT NULL,
  warning_count INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  update_id        INTEGER NOT NULL REFERENCES schedule_updates(id) ON DELETE CASCADE,
  p6_id            TEXT    NOT NULL,
  short_name       TEXT    NOT NULL,
  data_date        TIMESTAMP,
  planned_start    TIMESTAMP,
  must_finish_by   TIMESTAMP,
  scheduled_finish TIMESTAMP,
  PRIMARY KEY (update_id, p6_id)
);

CREATE TABLE IF NOT EXISTS wbs (
  update_id       INTEGER NOT NULL REFERENCES schedule_updates(id) ON DELETE CASCADE,
  p6_id           TEXT    NOT NULL,
  project_p6_id   TEXT    NOT NULL,
  parent_p6_id    TEXT,
  code            TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  is_project_node BOOLEAN NOT NULL,
  PRIMARY KEY (update_id, p6_id),
  FOREIGN KEY (update_id, project_p6_id) REFERENCES projects(update_id, p6_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  update_id              INTEGER NOT NULL REFERENCES schedule_updates(id) ON DELETE CASCADE,
  p6_id                  TEXT    NOT NULL,
  project_p6_id          TEXT    NOT NULL,
  wbs_p6_id              TEXT,
  code                   TEXT    NOT NULL,
  name                   TEXT    NOT NULL,
  type                   TEXT    NOT NULL CHECK (type IN ('task','start_milestone','finish_milestone','level_of_effort','wbs_summary','resource_dependent')),
  status                 TEXT    NOT NULL CHECK (status IN ('not_started','in_progress','completed')),
  percent_complete_type  TEXT    NOT NULL CHECK (percent_complete_type IN ('physical','duration','units')),
  physical_percent       NUMERIC NOT NULL CHECK (physical_percent BETWEEN 0 AND 100),
  planned_duration_hrs   NUMERIC,
  remaining_duration_hrs NUMERIC,
  total_float_hrs        NUMERIC,
  free_float_hrs         NUMERIC,
  actual_start           TIMESTAMP,
  actual_finish          TIMESTAMP,
  early_start            TIMESTAMP,
  early_finish           TIMESTAMP,
  late_start             TIMESTAMP,
  late_finish            TIMESTAMP,
  baseline_start         TIMESTAMP,
  baseline_finish        TIMESTAMP,
  on_driving_path        BOOLEAN NOT NULL,
  PRIMARY KEY (update_id, p6_id),
  FOREIGN KEY (update_id, project_p6_id) REFERENCES projects(update_id, p6_id)
);

CREATE TABLE IF NOT EXISTS relationships (
  update_id         INTEGER NOT NULL REFERENCES schedule_updates(id) ON DELETE CASCADE,
  p6_id             TEXT    NOT NULL,
  successor_p6_id   TEXT    NOT NULL,
  predecessor_p6_id TEXT    NOT NULL,
  type              TEXT    NOT NULL CHECK (type IN ('FS','SS','FF','SF')),
  lag_hrs           NUMERIC NOT NULL,
  PRIMARY KEY (update_id, p6_id),
  FOREIGN KEY (update_id, successor_p6_id)   REFERENCES tasks(update_id, p6_id),
  FOREIGN KEY (update_id, predecessor_p6_id) REFERENCES tasks(update_id, p6_id)
);

CREATE TABLE IF NOT EXISTS import_warnings (
  id         SERIAL  PRIMARY KEY,
  update_id  INTEGER NOT NULL REFERENCES schedule_updates(id) ON DELETE CASCADE,
  code       TEXT    NOT NULL,
  message    TEXT    NOT NULL,
  line       INTEGER,
  table_name TEXT,
  field      TEXT
);

CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (update_id, status);

-- Added on day 2 ---------------------------------------------------------------

-- Settings needed to compute metrics exactly like P6 would.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS critical_path_type     TEXT    NOT NULL DEFAULT 'total_float';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS critical_float_hrs     NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS calendar_hours_per_day NUMERIC;

-- Who uploaded each file.
ALTER TABLE schedule_updates ADD COLUMN IF NOT EXISTS uploaded_by INTEGER;

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,   -- scrypt, never the plain password
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Added on day 3 ---------------------------------------------------------------

-- A duplicate is the same file read with the same encoding. Re-uploading the same
-- bytes with a different encoding (to fix names) is a new, valid update.
ALTER TABLE schedule_updates DROP CONSTRAINT IF EXISTS schedule_updates_file_sha256_key;
CREATE UNIQUE INDEX IF NOT EXISTS schedule_updates_file_encoding_key ON schedule_updates (file_sha256, encoding);

-- Added on day 4 ---------------------------------------------------------------

-- Summaries are cached per update, project and language so the model is only
-- paid for once. "Regenerate" replaces the row.
CREATE TABLE IF NOT EXISTS summaries (
  update_id     INTEGER     NOT NULL REFERENCES schedule_updates(id) ON DELETE CASCADE,
  project_p6_id TEXT        NOT NULL,
  lang          TEXT        NOT NULL CHECK (lang IN ('en', 'es')),
  payload       JSONB       NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (update_id, project_p6_id, lang)
);
