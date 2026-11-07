/**
 * Calls the Python AI service (ai/). All the anti-invention logic lives there;
 * this file only sends the computed metrics and returns the answer.
 */
import type { MetricsResult } from "../metrics/compute.js";

export interface SummarySegment {
  text: string;
  fact?: string | null;
  label?: string | null;
}

export interface Summary {
  text: string;
  segments: SummarySegment[];
  source: "ai" | "template";
  model: string | null;
  attempts: { ok: boolean; problems: string[] }[];
  reason: string | null;
  reasonCode: "no_model" | "model_error" | "all_rejected" | null;
}

export type SummarizeFn = (project: MetricsResult, lang: "en" | "es") => Promise<Summary>;

export class AiServiceUnavailable extends Error {}

export function httpSummarizer(baseUrl: string, token?: string): SummarizeFn {
  return async (project, lang) => {
    let res: Response;
    try {
      res = await fetch(`${baseUrl.replace(/\/$/, "")}/summaries`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { "x-service-token": token } : {}) },
        body: JSON.stringify({ lang, project }),
        // Up to 3 drafts of ~30 s each in the worst case.
        signal: AbortSignal.timeout(100_000),
      });
    } catch {
      throw new AiServiceUnavailable("The summary service is not running.");
    }
    if (!res.ok) throw new AiServiceUnavailable(`The summary service answered ${res.status}.`);
    return (await res.json()) as Summary;
  };
}
