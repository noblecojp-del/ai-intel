import { q } from "./db";

export async function startJob(job: string, trigger: string): Promise<number> {
  const [r] = await q<{ id: number }>("INSERT INTO job_runs (job, trigger) VALUES ($1,$2) RETURNING id", [job, trigger]);
  return r.id;
}

export async function logJobError(runId: number, scope: string, message: string) {
  await q("INSERT INTO job_errors (job_run_id, scope, message) VALUES ($1,$2,$3)", [runId, scope, message.slice(0, 2000)]);
}

export async function finishJob(runId: number, status: "success" | "partial" | "failed", stats: unknown) {
  await q("UPDATE job_runs SET status=$2, stats=$3, finished_at=now() WHERE id=$1", [runId, status, JSON.stringify(stats)]);
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 800): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw last;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
