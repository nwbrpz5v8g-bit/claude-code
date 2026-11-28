import { err, ok, type Result } from "../shared/result";
import type { DomainError } from "../shared/errors";
import type { BayId, BookingId, LocationId, PackageId, UserId } from "../shared/ids";

export const BOOKING_STATUSES = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "EXPIRED",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses that occupy a bay. Must match the DB exclusion constraint predicate. */
export const ACTIVE_STATUSES: ReadonlySet<BookingStatus> = new Set([
  "PENDING_PAYMENT",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
]);

const TRANSITIONS: Readonly<Record<BookingStatus, ReadonlyArray<BookingStatus>>> = {
  PENDING_PAYMENT: ["CONFIRMED", "EXPIRED", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  EXPIRED: [],
};

export type Booking = {
  readonly id: BookingId;
  readonly customerId: UserId;
  readonly locationId: LocationId;
  readonly bayId: BayId;
  readonly packageId: PackageId;
  readonly packageName: string;
  readonly priceCents: number;
  readonly currency: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: BookingStatus;
  readonly idempotencyKey: string;
  readonly paymentRef: string | null;
  readonly refundedCents: number;
  readonly holdExpiresAt: Date | null;
  readonly version: number;
};

export const PAYMENT_HOLD_MINUTES = 10;

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transition(
  booking: Booking,
  to: BookingStatus,
): Result<Booking, Extract<DomainError, { kind: "InvalidTransition" }>> {
  if (!canTransition(booking.status, to)) {
    return err({ kind: "InvalidTransition", from: booking.status, to });
  }
  return ok({
    ...booking,
    status: to,
    holdExpiresAt: to === "PENDING_PAYMENT" ? booking.holdExpiresAt : null,
  });
}
