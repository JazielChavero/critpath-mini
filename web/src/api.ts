/**
 * Talks to the API. The login token is kept in sessionStorage, so closing the
 * tab logs you out.
 */

export type Status = "not_started" | "in_progress" | "completed";

export interface Issue {
  severity: "error" | "warning";
  code: string;
  message: string;
  line?: number | null;
  table?: string | null;
  field?: string | null;
}

export interface UpdateSummary {
  id: number;
  file_name: string;
  uploaded_at: string;
  p6_version: string;
  warning_count: number;
  project: string | null;
  data_date: string | null;
  activities: number;
}

export interface MetricDefinition {
  key: string;
  label: string;
  unit: "count" | "percent" | "date" | "days";
  formula: string;
}

export interface ActivityRef {
  code: string;
  name: string;
  status: Status;
  totalFloatDays: number | null;
  baselineFinish: string | null;
  earlyFinish: string | null;
}

export interface ProjectMetrics {
  projectId: string;
  projectName: string;
  plannedStart: string | null;
  values: Record<string, number | string | null>;
  hoursPerDay: number;
  hoursPerDayAssumed: boolean;
  topCritical: ActivityRef[];
}

export interface MetricsResponse {
  update: { id: number; file_name: string; uploaded_at: string; p6_version: string; encoding: string; warning_count: number };
  definitions: MetricDefinition[];
  projects: ProjectMetrics[];
}

export type UploadResult =
  | { kind: "ok"; updateId: number; activities: number; warnings: Issue[] }
  | { kind: "duplicate"; existingUpdateId: number; message: string }
  | { kind: "invalid"; message: string; errors: Issue[]; warnings: Issue[] }
  | { kind: "error"; message: string };

const TOKEN_KEY = "critpath.token";

export const session = {
  get: () => {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable: stay logged in for this page only */
    }
  },
};

export class AuthError extends Error {}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = session.get();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  if (res.status === 401) {
    session.set(null);
    throw new AuthError("Your session ended. Log in again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body as T;
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Could not log in.");
  session.set(body.token);
}

export const listUpdates = () => request<{ updates: UpdateSummary[] }>("/updates").then((r) => r.updates);
export const getMetrics = (id: number) => request<MetricsResponse>(`/updates/${id}/metrics`);
export const getWarnings = (id: number) => request<{ warnings: Issue[] }>(`/updates/${id}/warnings`).then((r) => r.warnings);

export async function uploadSchedule(file: File, encoding?: string): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  const token = session.get();
  const qs = encoding ? `?encoding=${encodeURIComponent(encoding)}` : "";
  let res: Response;
  try {
    res = await fetch(`/api/updates${qs}`, {
      method: "POST",
      body: form,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  } catch {
    return { kind: "error", message: "Could not reach the server. Check that the API is running." };
  }
  if (res.status === 401) {
    session.set(null);
    throw new AuthError("Your session ended. Log in again.");
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 201) return { kind: "ok", updateId: body.updateId, activities: body.activities, warnings: body.warnings };
  if (res.status === 409) return { kind: "duplicate", existingUpdateId: body.existingUpdateId, message: body.error };
  if (res.status === 422) return { kind: "invalid", message: body.error, errors: body.errors, warnings: body.warnings };
  return { kind: "error", message: body.error ?? `Upload failed (${res.status}).` };
}
