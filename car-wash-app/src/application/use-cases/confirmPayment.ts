import { transition } from "@/domain/booking/booking";
import { err, ok, type Result } from "@/domain/shared/result";
import type { DomainError } from "@/domain/shared/errors";
import type { BookingId } from "@/domain/shared/ids";
import type { BookingRepository, WebhookEventLog } from "../ports/repositories";
import type { PaymentGateway } from "../ports/payments";
import type { Logger } from "../ports/system";

export type PaymentEvent =
  | { kind: "paid"; eventId: string; bookingId: BookingId; paymentRef: string; amountCents: number }
  | { kind: "checkoutExpired"; eventId: string; bookingId: BookingId };

export type PaymentEventOutcome = "confirmed" | "expired" | "duplicate" | "ignored" | "refunded_late_payment";

export type ConfirmPaymentDeps = {
  bookings: BookingRepository;
  payments: PaymentGateway;
  events: WebhookEventLog;
  logger: Logger;
};

/**
 * Handles payment-provider events. Safe under duplicate, concurrent and
 * out-of-order delivery:
 * - an event id is recorded only after it was fully processed, so a failure
 *   (returned as an error → non-2xx → provider retries) is never swallowed;
 * - every state change goes through the booking state machine plus optimistic
 *   locking, so a concurrent duplicate cannot apply twice;
 * - refunds carry an idempotency key, so a retried refund is not paid twice.
 */
export async function handlePaymentEvent(
  deps: ConfirmPaymentDeps,
  event: PaymentEvent,
): Promise<Result<PaymentEventOutcome, DomainError>> {
  if (await deps.events.has(event.eventId)) return ok("duplicate");

  const outcome = await process(deps, event);
  if (outcome.ok) await deps.events.record(event.eventId, event.kind);
  return outcome;
}

async function process(deps: ConfirmPaymentDeps, event: PaymentEvent): Promise<Result<PaymentEventOutcome, DomainError>> {
  const booking = await deps.bookings.findById(event.bookingId);
  if (!booking) {
    deps.logger.warn("payment event for unknown booking", { eventId: event.eventId, bookingId: event.bookingId });
    return ok("ignored"); // nothing to retry; acknowledging stops redelivery
  }

  if (event.kind === "checkoutExpired") {
    if (!transition(booking, "EXPIRED").ok) return ok("ignored"); // already confirmed, cancelled or expired
    const saved = await deps.bookings.update(booking.id, booking.version, { status: "EXPIRED", holdExpiresAt: null });
    return saved ? ok("expired") : err({ kind: "Conflict", reason: "StaleVersion" });
  }

  if (event.amountCents !== booking.priceCents) {
    deps.logger.error("paid amount does not match booking price", {
      bookingId: booking.id, paid: event.amountCents, price: booking.priceCents,
    });
  }

  if (transition(booking, "CONFIRMED").ok) {
    const saved = await deps.bookings.update(booking.id, booking.version, {
      status: "CONFIRMED",
      paymentRef: event.paymentRef,
      holdExpiresAt: null,
    });
    return saved ? ok("confirmed") : err({ kind: "Conflict", reason: "StaleVersion" });
  }

  if (booking.status !== "EXPIRED" && booking.status !== "CANCELLED") return ok("ignored");
  if (booking.refundedCents >= event.amountCents) return ok("refunded_late_payment");

  // Paid after the hold lapsed: the slot may already be resold, so refund in full.
  const refund = await deps.payments.refund(event.paymentRef, event.amountCents, `late-payment:${booking.id}`);
  if (!refund.ok) {
    deps.logger.error("refund for late payment failed", { bookingId: booking.id, error: refund.error.message });
    return err({ kind: "PaymentFailed", retryable: refund.error.retryable });
  }
  const saved = await deps.bookings.update(booking.id, booking.version, {
    paymentRef: event.paymentRef,
    refundedCents: event.amountCents,
  });
  return saved ? ok("refunded_late_payment") : err({ kind: "Conflict", reason: "StaleVersion" });
}
