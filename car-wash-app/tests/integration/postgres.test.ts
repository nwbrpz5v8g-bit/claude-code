import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaBookingRepository, PrismaCatalogRepository } from "@/infra/db/prismaRepositories";
import { bookWash } from "@/application/use-cases/bookWash";
import type { Actor } from "@/application/actor";
import { asId, type BayId, type LocationId, type PackageId } from "@/domain/shared/ids";
import { FakePayments, FixedClock, silentLogger } from "../support/fakes";

/**
 * Runs against a real Postgres so the exclusion constraint itself is tested.
 * Set TEST_DATABASE_URL to a disposable, migrated database to enable.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Postgres integration", () => {
  // Constructed lazily: a skipped suite still runs this body during collection.
  let db: PrismaClient;
  let bookings: PrismaBookingRepository;
  let catalog: PrismaCatalogRepository;
  let locationId: string;
  let packageId: string;
  let bayIds: string[];
  let actors: Actor[];

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: url! } } });
    bookings = new PrismaBookingRepository(db);
    catalog = new PrismaCatalogRepository(db);
    await db.$connect();
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  beforeEach(async () => {
    await db.$executeRawUnsafe(`TRUNCATE "ProcessedWebhookEvent", "Booking", "Bay", "BlackoutDate", "OperatingHours", "Location", "Package", "User" CASCADE`);
    const loc = await db.location.create({
      data: {
        name: "IT", address: "x", timezone: "America/New_York", minLeadTimeMin: 0,
        operatingHours: { create: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAt: "08:00", closesAt: "18:00" })) },
        bays: { create: [{ name: "1" }, { name: "2" }, { name: "3" }] },
      },
      include: { bays: true },
    });
    locationId = loc.id;
    bayIds = loc.bays.map((b) => b.id);
    packageId = (await db.package.create({ data: { code: "b", name: "Basic", description: "", durationMin: 30, priceCents: 1000 } })).id;
    actors = await Promise.all(
      Array.from({ length: 20 }, async (_, i) => {
        const u = await db.user.create({ data: { email: `u${i}@test.dev` } });
        return { kind: "user", id: asId(u.id), email: u.email, role: "CUSTOMER" } as Actor;
      }),
    );
  });

  const base = (bayId: string, i: number) => ({
    customerId: (actors[i] as Extract<Actor, { kind: "user" }>).id,
    locationId: asId<LocationId>(locationId), bayId: asId<BayId>(bayId), packageId: asId<PackageId>(packageId),
    packageName: "Basic", priceCents: 1000, currency: "usd",
    startsAt: new Date("2026-06-10T14:00:00Z"), endsAt: new Date("2026-06-10T14:30:00Z"),
    status: "PENDING_PAYMENT" as const, idempotencyKey: crypto.randomUUID(), holdExpiresAt: new Date("2026-06-10T13:00:00Z"),
  });

  it("the exclusion constraint admits exactly one of 20 concurrent inserts on one bay", async () => {
    const outcomes = await Promise.all(Array.from({ length: 20 }, (_, i) => bookings.insert(base(bayIds[0]!, i))));
    expect(outcomes.filter((o) => o.kind === "inserted")).toHaveLength(1);
    expect(outcomes.filter((o) => o.kind === "bayTaken")).toHaveLength(19);
  });

  it("allows back-to-back bookings and reuse of cancelled slots", async () => {
    const first = await bookings.insert(base(bayIds[0]!, 0));
    expect(first.kind).toBe("inserted");
    const next = { ...base(bayIds[0]!, 1), startsAt: new Date("2026-06-10T14:30:00Z"), endsAt: new Date("2026-06-10T15:00:00Z") };
    expect((await bookings.insert(next)).kind).toBe("inserted");
    if (first.kind !== "inserted") return;
    await bookings.update(first.booking.id, first.booking.version, { status: "CANCELLED" });
    expect((await bookings.insert(base(bayIds[0]!, 2))).kind).toBe("inserted");
  });

  it("detects duplicate idempotency keys", async () => {
    const b = base(bayIds[0]!, 0);
    await bookings.insert(b);
    expect((await bookings.insert({ ...b, bayId: asId<BayId>(bayIds[1]!) })).kind).toBe("duplicateIdempotencyKey");
  });

  it("optimistic locking rejects a stale version", async () => {
    const r = await bookings.insert(base(bayIds[0]!, 0));
    if (r.kind !== "inserted") throw new Error("setup");
    expect(await bookings.update(r.booking.id, r.booking.version, { status: "CONFIRMED" })).not.toBeNull();
    expect(await bookings.update(r.booking.id, r.booking.version, { status: "CANCELLED" })).toBeNull();
  });

  it("20 customers racing for one slot at a 3-bay location: exactly 3 succeed", async () => {
    const deps = { catalog, bookings, payments: new FakePayments(), clock: new FixedClock(new Date("2026-06-10T12:00:00Z")), logger: silentLogger };
    const results = await Promise.all(
      actors.map((a) =>
        bookWash(deps, a, {
          locationId: asId(locationId), packageId: asId(packageId), startsAt: new Date("2026-06-10T14:00:00Z"),
          expectedPriceCents: 1000, idempotencyKey: crypto.randomUUID(),
        }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok && r.error.kind === "SlotUnavailable")).toHaveLength(17);
    const rows = await db.booking.findMany({ where: { status: "PENDING_PAYMENT" } });
    expect(new Set(rows.map((r) => r.bayId)).size).toBe(3);
  });
});
