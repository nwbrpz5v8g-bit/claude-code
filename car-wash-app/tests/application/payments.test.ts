import { beforeEach, describe, expect, it } from "vitest";
import { bookWash } from "@/application/use-cases/bookWash";
import { cancelBooking } from "@/application/use-cases/cancelBooking";
import { handlePaymentEvent } from "@/application/use-cases/confirmPayment";
import type { BookingId } from "@/domain/shared/ids";
import { alice, bob, LOC, makeDeps, PKG } from "../support/fakes";

const NOW = new Date("2026-06-10T12:00:00Z");
const SLOT = new Date("2026-06-12T14:00:00Z"); // two days out

let deps: ReturnType<typeof makeDeps>;
let bookingId: BookingId;

beforeEach(async () => {
  deps = makeDeps(NOW);
  const r = await bookWash(deps, alice, {
    locationId: LOC, packageId: PKG, startsAt: SLOT, expectedPriceCents: 2000, idempotencyKey: crypto.randomUUID(),
  });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  bookingId = r.value.bookingId;
});

const paid = (eventId = "evt_1") => ({ kind: "paid" as const, eventId, bookingId, paymentRef: "pi_1", amountCents: 2000 });

describe("handlePaymentEvent", () => {
  it("confirms a pending booking", async () => {
    expect(await handlePaymentEvent(deps, paid())).toEqual({ ok: true, value: "confirmed" });
    expect((await deps.bookings.findById(bookingId))).toMatchObject({ status: "CONFIRMED", paymentRef: "pi_1", holdExpiresAt: null });
  });

  it("ignores duplicate deliveries of the same event", async () => {
    await handlePaymentEvent(deps, paid());
    expect(await handlePaymentEvent(deps, paid())).toEqual({ ok: true, value: "duplicate" });
  });

  it("tolerates a second, distinct success event for an already-confirmed booking", async () => {
    await handlePaymentEvent(deps, paid("evt_1"));
    expect(await handlePaymentEvent(deps, paid("evt_2"))).toEqual({ ok: true, value: "ignored" });
  });

  it("ignores an expiry event that arrives after payment (out-of-order delivery)", async () => {
    await handlePaymentEvent(deps, paid());
    expect(await handlePaymentEvent(deps, { kind: "checkoutExpired", eventId: "evt_x", bookingId })).toEqual({ ok: true, value: "ignored" });
    expect((await deps.bookings.findById(bookingId))!.status).toBe("CONFIRMED");
  });

  it("refunds a payment that lands after the hold expired, exactly once", async () => {
    deps.clock.advance(11 * 60_000);
    await deps.bookings.expireStaleHolds(deps.clock.now());
    expect(await handlePaymentEvent(deps, paid("evt_late"))).toEqual({ ok: true, value: "refunded_late_payment" });
    expect(await handlePaymentEvent(deps, paid("evt_late_retry"))).toEqual({ ok: true, value: "refunded_late_payment" });
    expect(deps.payments.refunds).toHaveLength(1);
  });

  it("does not record an event whose processing failed, so the provider's retry is processed", async () => {
    deps.clock.advance(11 * 60_000);
    await deps.bookings.expireStaleHolds(deps.clock.now());
    deps.payments.failRefund = true;
    expect((await handlePaymentEvent(deps, paid("evt_r"))).ok).toBe(false);
    deps.payments.failRefund = false;
    expect(await handlePaymentEvent(deps, paid("evt_r"))).toEqual({ ok: true, value: "refunded_late_payment" });
  });
});

describe("cancelBooking", () => {
  it("refunds in full more than 24h ahead", async () => {
    await handlePaymentEvent(deps, paid());
    const r = await cancelBooking(deps, alice, { bookingId });
    expect(r).toEqual({ ok: true, value: { refund: { kind: "full", refundCents: 2000 } } });
    expect(deps.payments.refunds).toEqual([{ ref: "pi_1", amount: 2000, key: `cancel:${bookingId}` }]);
    expect((await deps.bookings.findById(bookingId))).toMatchObject({ status: "CANCELLED", refundedCents: 2000 });
  });

  it("hides other customers' bookings as NotFound", async () => {
    expect(await cancelBooking(deps, bob, { bookingId })).toEqual({ ok: false, error: { kind: "NotFound", entity: "Booking" } });
  });

  it("rejects a stale version", async () => {
    await handlePaymentEvent(deps, paid()); // version 2 → 3
    expect(await cancelBooking(deps, alice, { bookingId, expectedVersion: 1 })).toEqual({ ok: false, error: { kind: "Conflict", reason: "StaleVersion" } });
  });

  it("keeps the booking when the refund fails", async () => {
    await handlePaymentEvent(deps, paid());
    deps.payments.failRefund = true;
    expect(await cancelBooking(deps, alice, { bookingId })).toEqual({ ok: false, error: { kind: "PaymentFailed", retryable: true } });
    expect((await deps.bookings.findById(bookingId))!.status).toBe("CONFIRMED");
  });

  it("cannot cancel twice", async () => {
    await handlePaymentEvent(deps, paid());
    await cancelBooking(deps, alice, { bookingId });
    const r = await cancelBooking(deps, alice, { bookingId });
    expect(r.ok || r.error.kind).toBe("CancellationNotAllowed");
  });
});
