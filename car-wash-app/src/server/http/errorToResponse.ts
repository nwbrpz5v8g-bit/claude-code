import type { DomainError } from "@/domain/shared/errors";

export const API_VERSION = "1";

/** Response envelope for /api/v1. Additive changes only; breaking changes go to /api/v2. */
export type ApiSuccess<T> = { data: T };
/** `Internal` is transport-only: unexpected faults never leak details, only a reference id. */
export type ApiError = (DomainError | { kind: "Internal"; requestId: string }) & { message: string };
export type ApiFailure = { error: ApiError };

const baseHeaders = { "Content-Type": "application/json", "Api-Version": API_VERSION, "Cache-Control": "no-store" };

export function json<T>(status: number, body: ApiSuccess<T> | ApiFailure, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...baseHeaders, ...extra } });
}

export const success = <T>(data: T, status = 200) => json(status, { data });

/** The single place where domain errors become HTTP. Exhaustive by construction. */
export function errorToResponse(e: DomainError): Response {
  const fail = (status: number, message: string, extra?: Record<string, string>) =>
    json(status, { error: { ...e, message } }, extra);

  switch (e.kind) {
    case "Unauthenticated":
      return fail(401, "Please sign in to continue");
    case "Forbidden":
      return fail(403, e.reason);
    case "NotFound":
      return fail(404, `${e.entity} not found`);
    case "Validation":
      return fail(422, e.issues.map((i) => i.message).join("; "));
    case "LocationClosed":
      return fail(409, `Closed on ${e.date}: ${e.reason}`);
    case "SlotUnavailable":
      return fail(409, "That time was just taken. Please pick another slot.");
    case "InvalidTransition":
      return fail(409, `Cannot change booking from ${e.from} to ${e.to}`);
    case "CancellationNotAllowed":
      return fail(409, e.reason);
    case "PaymentFailed":
      return fail(402, e.retryable ? "Payment provider unavailable, please retry" : "Payment could not be processed");
    case "RateLimited":
      return fail(429, "Too many requests", { "Retry-After": String(e.retryAfterSec) });
    case "Conflict":
      return fail(409, e.reason === "StaleVersion" ? "This booking changed; refresh and try again" : "Idempotency key reused for a different request");
    default: {
      const unreachable: never = e;
      throw new Error(`Unhandled domain error: ${JSON.stringify(unreachable)}`);
    }
  }
}
