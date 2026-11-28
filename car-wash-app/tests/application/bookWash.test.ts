import { describe, expect, it } from "vitest";
import { bookWash, type BookWashInput } from "@/application/use-cases/bookWash";
import { getAvailability } from "@/application/use-cases/getAvailability";
import { alice, bob, LOC, makeDeps, PKG, pkg } from "../support/fakes";

// 2026-06-10 is a Wednesday; the fake location is open 08:00–18:00 New York time.
const NOW = new Date("2026-06-10T12:00:00Z"); // 08:00 local
const SLOT = new Date("2026-06-10T14:00:00Z"); // 10:00 local

const input = (over: Partial<BookWashInput> = {}): BookWashInput => ({
  locationId: LOC, packageId: PKG, startsAt: SLOT, expectedPriceCents: 2000,
  idempotencyKey: crypto.randomUUID(), ...over,
});

describe("bookWash", () => {
  it("requires authentication", async () => {
    const r = await bookWash(makeDeps(NOW), { kind: "anonymous" }, input());
    expect(r).toEqual({ ok: false, error: { kind: "Unauthenticated" } });
  });

  it("creates a pending booking with a payment hold and returns a checkout URL", async () => {
    const deps = makeDeps(NOW);
    const r = await bookWash(deps, alice, input());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.checkoutUrl).toMatch(/^https:\/\/pay\.test\//);
    const b = await deps.bookings.findById(r.value.bookingId);
    expect(b).toMatchObject({ status: "PENDING_PAYMENT", priceCents: 2000, packageName: "Basic", paymentRef: `ref_${b!.id}` });
    expect(b!.holdExpiresAt!.getTime() - NOW.getTime()).toBe(10 * 60_000);
  });

  it("is idempotent: the same key returns the same booking, not a second one", async () => {
    const deps = makeDeps(NOW);
    const req = input();
    const a = await bookWash(deps, alice, req);
    const b = await bookWash(deps, alice, req);
    expect(a.ok && b.ok && a.value.bookingId === b.value.bookingId).toBe(true);
    expect(deps.bookings.rows.size).toBe(1);
    expect(b.ok && b.value.checkoutUrl).toContain("/resume/");
  });

  it("refuses a reused key for a different request", async () => {
    const deps = makeDeps(NOW);
    const key = crypto.randomUUID();
    await bookWash(deps, alice, input({ idempotencyKey: key }));
    const r = await bookWash(deps, bob, input({ idempotencyKey: key }));
    expect(r).toEqual({ ok: false, error: { kind: "Conflict", reason: "IdempotencyKeyReuse" } });
  });

  it("fills bays in turn and reports SlotUnavailable when all are taken", async () => {
    const deps = makeDeps(NOW);
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await bookWash(deps, alice, input()));
    expect(results.map((r) => r.ok)).toEqual([true, true, false]);
    expect(results[2]).toEqual({ ok: false, error: { kind: "SlotUnavailable", startsAt: SLOT.toISOString() } });
    const bays = new Set([...deps.bookings.rows.values()].map((b) => b.bayId));
    expect(bays.size).toBe(2);
  });

  it("falls through to the next bay when it loses a race for the first one", async () => {
    const deps = makeDeps(NOW);
    // Simulate a concurrent request winning bay 1 between availability and insert.
    const realInsert = deps.bookings.insert.bind(deps.bookings);
    let raced = false;
    deps.bookings.insert = async (nb) => {
      if (!raced) {
        raced = true;
        await realInsert({ ...nb, idempotencyKey: "racer", customerId: bob.kind === "user" ? bob.id : nb.customerId });
      }
      return realInsert(nb);
    };
    const r = await bookWash(deps, alice, input());
    expect(r.ok).toBe(true);
    expect(deps.bookings.rows.size).toBe(2);
  });

  it("rejects slots that are not on the server-computed grid", async () => {
    const r = await bookWash(makeDeps(NOW), alice, input({ startsAt: new Date("2026-06-10T14:07:00Z") }));
    expect(r.ok || r.error.kind).toBe("SlotUnavailable");
  });

  it("rejects slots inside the lead time or in the past", async () => {
    const deps = makeDeps(NOW);
    expect((await bookWash(deps, alice, input({ startsAt: new Date("2026-06-10T12:15:00Z") }))).ok).toBe(false);
    expect((await bookWash(deps, alice, input({ startsAt: new Date("2026-06-09T14:00:00Z") }))).ok).toBe(false);
  });

  it("reports a closed day with its reason", async () => {
    const deps = makeDeps(NOW);
    deps.catalog.loc = { ...deps.catalog.loc, blackoutDates: [{ date: "2026-06-10", reason: "Water main repair" }] };
    const r = await bookWash(deps, alice, input());
    expect(r).toEqual({ ok: false, error: { kind: "LocationClosed", date: "2026-06-10", reason: "Water main repair" } });
  });

  it("refuses when the price changed since the customer saw it", async () => {
    const deps = makeDeps(NOW);
    deps.catalog.pk = pkg({ priceCents: 2500 });
    const r = await bookWash(deps, alice, input());
    expect(r.ok || r.error.kind).toBe("Validation");
    expect(deps.bookings.rows.size).toBe(0);
  });

  it("releases the hold when checkout cannot be created", async () => {
    const deps = makeDeps(NOW);
    deps.payments.failCheckout = { retryable: true };
    const r = await bookWash(deps, alice, input());
    expect(r).toEqual({ ok: false, error: { kind: "PaymentFailed", retryable: true } });
    expect([...deps.bookings.rows.values()][0]!.status).toBe("CANCELLED");
    // The slot is free again.
    deps.payments.failCheckout = null;
    expect((await bookWash(deps, alice, input())).ok).toBe(true);
    expect((await bookWash(deps, alice, input())).ok).toBe(true);
  });

  it("frees slots whose payment hold lapsed", async () => {
    const deps = makeDeps(NOW);
    await bookWash(deps, alice, input());
    await bookWash(deps, alice, input());
    expect((await bookWash(deps, alice, input())).ok).toBe(false);
    deps.clock.advance(11 * 60_000);
    expect((await bookWash(deps, alice, input())).ok).toBe(true);
  });
});

describe("bookWash pricing", () => {
  const QUIET_SLOT = new Date("2026-06-10T18:00:00Z"); // Wed 14:00 New York

  it("charges the Quiet Hours price and snapshots it on the booking", async () => {
    const deps = makeDeps(NOW);
    const r = await bookWash(deps, alice, input({ startsAt: QUIET_SLOT, expectedPriceCents: 1600 }));
    expect(r.ok).toBe(true);
    expect([...deps.bookings.rows.values()][0]!.priceCents).toBe(1600);
  });

  it("refuses a client that sends the full price for a discounted slot, or vice versa", async () => {
    const deps = makeDeps(NOW);
    expect((await bookWash(deps, alice, input({ startsAt: QUIET_SLOT, expectedPriceCents: 2000 }))).ok).toBe(false);
    expect((await bookWash(deps, alice, input({ expectedPriceCents: 1600 }))).ok).toBe(false);
    expect(deps.bookings.rows.size).toBe(0);
  });
});

describe("getAvailability", () => {
  it("quotes each slot with price and crowd level", async () => {
    const deps = makeDeps(NOW);
    await bookWash(deps, alice, input()); // takes one of two bays at 10:00
    const r = await getAvailability(deps, { locationId: LOC, packageId: PKG, localDate: "2026-06-10" });
    if (!r.ok) throw new Error("expected ok");
    const at = (t: string) => r.value.slots.find((s) => s.localTime === t)!;
    expect(at("10:00")).toMatchObject({ priceCents: 2000, discount: null, crowd: "steady", freeBays: 1 });
    expect(at("14:00")).toMatchObject({ priceCents: 1600, discount: { percentOff: 20 }, crowd: "calm" });
  });

  it("suggests the next open day when the requested day has no slots", async () => {
    const deps = makeDeps(NOW);
    deps.catalog.loc = { ...deps.catalog.loc, blackoutDates: [{ date: "2026-06-11", reason: "Holiday" }] };
    const r = await getAvailability(deps, { locationId: LOC, packageId: PKG, localDate: "2026-06-11" });
    expect(r.ok && r.value).toMatchObject({ closedReason: "Holiday", slots: [], nextAvailableDate: "2026-06-12" });
  });

  it("validates dates", async () => {
    const deps = makeDeps(NOW);
    for (const localDate of ["2026-06-09", "2026-02-30", "2027-01-01"]) {
      const r = await getAvailability(deps, { locationId: LOC, packageId: PKG, localDate });
      expect(r.ok || r.error.kind).toBe("Validation");
    }
  });

  it("defaults to today in the location's zone", async () => {
    const deps = makeDeps(new Date("2026-06-11T02:00:00Z")); // 22:00 on the 10th in New York
    const r = await getAvailability(deps, { locationId: LOC, packageId: PKG });
    expect(r.ok && r.value.localDate).toBe("2026-06-10");
    expect(r.ok && r.value.slots).toEqual([]); // past closing
    expect(r.ok && r.value.nextAvailableDate).toBe("2026-06-11");
  });
});
