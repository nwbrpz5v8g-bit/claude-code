import { err, ok, type Result } from "../shared/result";
import type { DomainError } from "../shared/errors";
import type { Booking } from "./booking";

export type RefundDecision =
  | { kind: "full"; refundCents: number }
  | { kind: "partial"; refundCents: number }
  | { kind: "none"; refundCents: 0 };

const HOUR_MS = 3_600_000;
export const FULL_REFUND_HOURS = 24;
export const PARTIAL_REFUND_HOURS = 2;
export const PARTIAL_REFUND_RATIO = 0.5;

/** Pure: how much a customer gets back if they cancel `booking` at `now`. */
export function decideCustomerCancellation(
  booking: Booking,
  now: Date,
): Result<RefundDecision, DomainError> {
  if (booking.status === "PENDING_PAYMENT") return ok({ kind: "none", refundCents: 0 });
  if (booking.status !== "CONFIRMED") {
    return err({ kind: "CancellationNotAllowed", reason: `Booking is ${booking.status}` });
  }
  const hoursUntilStart = (booking.startsAt.getTime() - now.getTime()) / HOUR_MS;
  if (hoursUntilStart <= 0) {
    return err({ kind: "CancellationNotAllowed", reason: "The wash has already started" });
  }
  if (hoursUntilStart >= FULL_REFUND_HOURS) {
    return ok({ kind: "full", refundCents: booking.priceCents });
  }
  if (hoursUntilStart >= PARTIAL_REFUND_HOURS) {
    return ok({ kind: "partial", refundCents: Math.floor(booking.priceCents * PARTIAL_REFUND_RATIO) });
  }
  return ok({ kind: "none", refundCents: 0 });
}
