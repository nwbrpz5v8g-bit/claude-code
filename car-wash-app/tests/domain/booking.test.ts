import { describe, expect, it } from "vitest";
import { canTransition, transition, type Booking } from "@/domain/booking/booking";
import { decideCustomerCancellation } from "@/domain/booking/cancellationPolicy";
import { asId } from "@/domain/shared/ids";
import { ALICE, BAY1, LOC, PKG } from "../support/fakes";

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: asId("b1"), customerId: ALICE, locationId: LOC, bayId: BAY1, packageId: PKG, packageName: "Basic",
  priceCents: 2000, currency: "usd", startsAt: new Date("2026-06-12T12:00:00Z"), endsAt: new Date("2026-06-12T12:30:00Z"),
  status: "CONFIRMED", idempotencyKey: "k", paymentRef: "ref", refundedCents: 0, holdExpiresAt: null, version: 1, ...over,
});

describe("booking state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("PENDING_PAYMENT", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "CHECKED_IN")).toBe(true);
    expect(canTransition("CHECKED_IN", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
  });

  it("rejects transitions out of terminal states", () => {
    for (const s of ["COMPLETED", "CANCELLED", "NO_SHOW", "EXPIRED"] as const) {
      expect(transition(booking({ status: s }), "CONFIRMED")).toEqual({ ok: false, error: { kind: "InvalidTransition", from: s, to: "CONFIRMED" } });
    }
  });

  it("clears the payment hold once a booking leaves PENDING_PAYMENT", () => {
    const r = transition(booking({ status: "PENDING_PAYMENT", holdExpiresAt: new Date() }), "CONFIRMED");
    expect(r.ok && r.value.holdExpiresAt).toBe(null);
  });
});

describe("customer cancellation policy", () => {
  const start = new Date("2026-06-12T12:00:00Z");
  const hoursBefore = (h: number) => new Date(start.getTime() - h * 3_600_000);

  it("full refund at 24h or more", () => {
    expect(decideCustomerCancellation(booking(), hoursBefore(24))).toEqual({ ok: true, value: { kind: "full", refundCents: 2000 } });
  });
  it("half refund between 2h and 24h", () => {
    expect(decideCustomerCancellation(booking(), hoursBefore(5))).toEqual({ ok: true, value: { kind: "partial", refundCents: 1000 } });
  });
  it("no refund under 2h", () => {
    expect(decideCustomerCancellation(booking(), hoursBefore(1))).toEqual({ ok: true, value: { kind: "none", refundCents: 0 } });
  });
  it("cannot cancel once started or finished", () => {
    expect(decideCustomerCancellation(booking(), start).ok).toBe(false);
    expect(decideCustomerCancellation(booking({ status: "COMPLETED" }), hoursBefore(48)).ok).toBe(false);
  });
  it("an unpaid hold can be released for free", () => {
    expect(decideCustomerCancellation(booking({ status: "PENDING_PAYMENT" }), hoursBefore(1))).toEqual({ ok: true, value: { kind: "none", refundCents: 0 } });
  });
});
