import type { BookingStatus } from "../booking/booking";

/**
 * Every expected failure in the system. Adding a variant is a compile error at
 * every exhaustive switch (e.g. the HTTP mapper) until it is handled.
 * Backward compatibility: API clients must treat unknown `kind`s as generic.
 */
export type DomainError =
  | { kind: "Unauthenticated" }
  | { kind: "Forbidden"; reason: string }
  | { kind: "NotFound"; entity: "Booking" | "Location" | "Package" | "User" }
  | { kind: "Validation"; issues: ReadonlyArray<{ path: string; message: string }> }
  | { kind: "LocationClosed"; date: string; reason: string }
  | { kind: "SlotUnavailable"; startsAt: string }
  | { kind: "InvalidTransition"; from: BookingStatus; to: BookingStatus }
  | { kind: "CancellationNotAllowed"; reason: string }
  | { kind: "PaymentFailed"; retryable: boolean }
  | { kind: "RateLimited"; retryAfterSec: number }
  | { kind: "Conflict"; reason: "StaleVersion" | "IdempotencyKeyReuse" };

export type ErrorKind = DomainError["kind"];

export const validation = (path: string, message: string): DomainError => ({
  kind: "Validation",
  issues: [{ path, message }],
});
