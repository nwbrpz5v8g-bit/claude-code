import { ACTIVE_STATUSES, type Booking } from "@/domain/booking/booking";
import type { Interval } from "@/domain/availability/slots";
import { ok, err } from "@/domain/shared/result";
import { asId, type BayId, type BookingId, type LocationId, type PackageId, type UserId } from "@/domain/shared/ids";
import type {
  BookingRepository, CatalogRepository, InsertBookingOutcome, LocationRecord, NewBooking, PackageRecord, WebhookEventLog,
} from "@/application/ports/repositories";
import type { PaymentGateway } from "@/application/ports/payments";
import type { Clock, Logger } from "@/application/ports/system";
import type { Actor } from "@/application/actor";

export const LOC = asId<LocationId>("00000000-0000-4000-8000-000000000001");
export const PKG = asId<PackageId>("00000000-0000-4000-8000-000000000002");
export const BAY1 = asId<BayId>("00000000-0000-4000-8000-0000000000b1");
export const BAY2 = asId<BayId>("00000000-0000-4000-8000-0000000000b2");
export const ALICE = asId<UserId>("00000000-0000-4000-8000-0000000000a1");
export const BOB = asId<UserId>("00000000-0000-4000-8000-0000000000a2");

export const alice: Actor = { kind: "user", id: ALICE, email: "alice@example.com", role: "CUSTOMER" };
export const bob: Actor = { kind: "user", id: BOB, email: "bob@example.com", role: "CUSTOMER" };

export const location = (over: Partial<LocationRecord> = {}): LocationRecord => ({
  id: LOC,
  name: "Test Wash",
  address: "1 Test St",
  timezone: "America/New_York",
  slotIntervalMin: 15,
  minLeadTimeMin: 30,
  isActive: true,
  hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAt: "08:00", closesAt: "18:00" })),
  blackoutDates: [],
  activeBayIds: [BAY1, BAY2],
  ...over,
});

export const pkg = (over: Partial<PackageRecord> = {}): PackageRecord => ({
  id: PKG, code: "basic", version: 1, name: "Basic", description: "", durationMin: 30, priceCents: 2000, currency: "usd", isActive: true, ...over,
});

export class FakeCatalog implements CatalogRepository {
  constructor(public loc: LocationRecord = location(), public pk: PackageRecord = pkg()) {}
  async listActiveLocations() { return [this.loc]; }
  async getLocation(id: LocationId) { return id === this.loc.id ? this.loc : null; }
  async listActivePackages() { return [this.pk]; }
  async getPackage(id: PackageId) { return id === this.pk.id ? this.pk : null; }
}

/** Emulates the DB: unique idempotency key and the bay-overlap exclusion constraint. */
export class FakeBookings implements BookingRepository {
  rows = new Map<string, Booking>();
  private seq = 0;

  async findById(id: BookingId) { return this.rows.get(id) ?? null; }
  async findByIdempotencyKey(key: string) { return [...this.rows.values()].find((b) => b.idempotencyKey === key) ?? null; }
  async listForCustomer(c: UserId) { return [...this.rows.values()].filter((b) => b.customerId === c); }
  async busyIntervals(locationId: LocationId, from: Date, to: Date) {
    const m = new Map<BayId, Interval[]>();
    for (const b of this.rows.values()) {
      if (b.locationId !== locationId || !ACTIVE_STATUSES.has(b.status)) continue;
      if (!(b.startsAt < to && b.endsAt > from)) continue;
      m.set(b.bayId, [...(m.get(b.bayId) ?? []), { start: b.startsAt, end: b.endsAt }]);
    }
    return m;
  }
  async insert(nb: NewBooking): Promise<InsertBookingOutcome> {
    if (await this.findByIdempotencyKey(nb.idempotencyKey)) return { kind: "duplicateIdempotencyKey" };
    const clash = [...this.rows.values()].some(
      (b) => b.bayId === nb.bayId && ACTIVE_STATUSES.has(b.status) && b.startsAt < nb.endsAt && nb.startsAt < b.endsAt,
    );
    if (clash) return { kind: "bayTaken" };
    const booking: Booking = { ...nb, id: asId(`00000000-0000-4000-8000-${String(++this.seq).padStart(12, "0")}`), version: 1, paymentRef: null, refundedCents: 0 };
    this.rows.set(booking.id, booking);
    return { kind: "inserted", booking };
  }
  async update(id: BookingId, expectedVersion: number, patch: Partial<Booking>) {
    const b = this.rows.get(id);
    if (!b || b.version !== expectedVersion) return null;
    const next = { ...b, ...patch, version: b.version + 1 };
    this.rows.set(id, next);
    return next;
  }
  async expireStaleHolds(now: Date) {
    let n = 0;
    for (const b of this.rows.values()) {
      if (b.status === "PENDING_PAYMENT" && b.holdExpiresAt && b.holdExpiresAt < now) {
        this.rows.set(b.id, { ...b, status: "EXPIRED", holdExpiresAt: null, version: b.version + 1 });
        n++;
      }
    }
    return n;
  }
}

export class FakePayments implements PaymentGateway {
  failCheckout: { retryable: boolean } | null = null;
  failRefund = false;
  refunds: Array<{ ref: string; amount: number; key: string }> = [];
  async createCheckout(req: { bookingId: string }) {
    if (this.failCheckout) return err({ ...this.failCheckout, message: "down" });
    return ok({ checkoutUrl: `https://pay.test/${req.bookingId}`, paymentRef: `ref_${req.bookingId}` });
  }
  async resumeCheckout(ref: string) { return ok({ checkoutUrl: `https://pay.test/resume/${ref}` }); }
  async refund(ref: string, amount: number, key: string) {
    if (this.failRefund) return err({ retryable: true, message: "refund down" });
    // Same idempotency key = same refund, as with Stripe.
    if (!this.refunds.some((r) => r.key === key)) this.refunds.push({ ref, amount, key });
    return ok(undefined);
  }
}

export class FakeEvents implements WebhookEventLog {
  ids = new Set<string>();
  async has(id: string) { return this.ids.has(id); }
  async record(id: string) { this.ids.add(id); }
}

export class FixedClock implements Clock {
  constructor(public current: Date) {}
  now() { return this.current; }
  advance(ms: number) { this.current = new Date(this.current.getTime() + ms); }
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };

export function makeDeps(now = new Date("2026-06-10T12:00:00Z")) {
  return {
    catalog: new FakeCatalog(),
    bookings: new FakeBookings(),
    payments: new FakePayments(),
    events: new FakeEvents(),
    clock: new FixedClock(now),
    logger: silentLogger,
  };
}
