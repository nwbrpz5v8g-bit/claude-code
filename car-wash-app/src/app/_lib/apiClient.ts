/** Typed client for /api/v1. Every call resolves (never throws) to a discriminated union. */
export type ApiErrorBody = { kind: string; message: string; [k: string]: unknown };
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: ApiErrorBody; retryAfterSec?: number };

export async function api<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    return { ok: false, status: 0, error: { kind: "Network", message: "You appear to be offline. Check your connection and retry." } };
  }
  const body = (await res.json().catch(() => null)) as { data?: T; error?: ApiErrorBody } | null;
  if (res.ok && body && "data" in body) return { ok: true, data: body.data as T };
  const retryAfter = Number(res.headers.get("Retry-After"));
  return {
    ok: false,
    status: res.status,
    error: body?.error ?? { kind: "Unknown", message: `Unexpected response (${res.status})` },
    ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSec: retryAfter } : {}),
  };
}
