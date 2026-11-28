import { transition } from "@/domain/booking/booking";
import { decideCustomerCancellation, type RefundDecision } from "@/domain/booking/cancellationPolicy";
import { err, ok, type Result } from "@/domain/shared/result";
import type { DomainError } from "@/domain/shared/errors";
import type { BookingId } from "@/domain/shared/ids";
import type { Actor } from "../actor";
import type { BookingRepository } from "../ports/repositories";
import type { PaymentGateway } from "../ports/payments";
import type { Clock, Logger } from "../ports/system";

export type CancelBookingDeps = { bookings: BookingRepository; payments: PaymentGateway; clock: Clock; logger: Logger };

export async function cancelBooking(
  deps: CancelBookingDeps,
  actor: Actor,
  input: { bookingId: BookingId; expectedVersion?: number },
): Promise<Result<{ refund: RefundDecision }, DomainError>> {
  if (actor.kind === "anonymous") return err({ kind: "Unauthenticated" });

  const booking = await deps.bookings.findById(input.bookingId);
  // Not-owned looks identical to not-found, so ids cannot be probed.
  if (!booking || booking.customerId !== actor.id) return err({ kind: "NotFound", entity: "Booking" });
  if (input.expectedVersion !== undefined && input.expectedVersion !== booking.version) {
    return err({ kind: "Conflict", reason: "StaleVersion" });
  }

  const decision = decideCustomerCancellation(booking, deps.clock.now());
  if (!decision.ok) return decision;
  const next = transition(booking, "CANCELLED");
  if (!next.ok) return next;

  // Refund first: if it fails, the booking stays intact and the customer can retry.
  if (decision.value.refundCents > 0) {
    if (!booking.paymentRef) {
      deps.logger.error("confirmed booking has no payment ref", { bookingId: booking.id });
      return err({ kind: "PaymentFailed", retryable: false });
    }
    const refund = await deps.payments.refund(booking.paymentRef, decision.value.refundCents, `cancel:${booking.id}`);
    if (!refund.ok) return err({ kind: "PaymentFailed", retryable: refund.error.retryable });
  }

  const saved = await deps.bookings.update(booking.id, booking.version, {
    status: "CANCELLED",
    refundedCents: decision.value.refundCents,
    holdExpiresAt: null,
  });
  if (!saved) {
    // The refund used an idempotency key, so a retry after this conflict does not refund twice.
    return err({ kind: "Conflict", reason: "StaleVersion" });
  }
  return ok({ refund: decision.value });
}
