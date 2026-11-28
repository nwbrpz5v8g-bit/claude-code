import { Prisma, type PrismaClient } from "@prisma/client";
import { ACTIVE_STATUSES, type BookingStatus } from "@/domain/booking/booking";
import type { Interval } from "@/domain/availability/slots";
import { asId, type BayId, type BookingId, type LocationId, type PackageId, type UserId } from "@/domain/shared/ids";
import type {
  BookingRepository,
  CatalogRepository,
  InsertBookingOutcome,
  LocationRecord,
  NewBooking,
  PackageRecord,
  UserRepository,
  WebhookEventLog,
} from "@/application/ports/repositories";
import { toBooking } from "./mappers";

const activeStatuses = [...ACTIVE_STATUSES] as BookingStatus[];

const locationInclude = {
  operatingHours: true,
  blackoutDates: true,
  bays: { where: { isActive: true }, orderBy: { name: "asc" } },
} satisfies Prisma.LocationInclude;

type LocationRow = Prisma.LocationGetPayload<{ include: typeof locationInclude }>;

const toLocation = (row: LocationRow): LocationRecord => ({
  id: asId(row.id),
  name: row.name,
  address: row.address,
  timezone: row.timezone,
  slotIntervalMin: row.slotIntervalMin,
  minLeadTimeMin: row.minLeadTimeMin,
  isActive: row.isActive,
  hours: row.operatingHours.map((h) => ({ dayOfWeek: h.dayOfWeek, opensAt: h.opensAt, closesAt: h.closesAt })),
  blackoutDates: row.blackoutDates.map((b) => ({ date: b.date, reason: b.reason })),
  activeBayIds: row.bays.map((b) => asId<BayId>(b.id)),
});

const toPackage = (row: Prisma.PackageGetPayload<object>): PackageRecord => ({
  id: asId(row.id),
  code: row.code,
  version: row.version,
  name: row.name,
  description: row.description,
  durationMin: row.durationMin,
  priceCents: row.priceCents,
  currency: row.currency,
  isActive: row.isActive,
});

export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly db: PrismaClient) {}

  async listActiveLocations() {
    const rows = await this.db.location.findMany({ where: { isActive: true }, include: locationInclude, orderBy: { name: "asc" } });
    return rows.map(toLocation);
  }
  async getLocation(id: LocationId) {
    const row = await this.db.location.findUnique({ where: { id }, include: locationInclude });
    return row ? toLocation(row) : null;
  }
  async listActivePackages() {
    const rows = await this.db.package.findMany({ where: { isActive: true }, orderBy: { priceCents: "asc" } });
    return rows.map(toPackage);
  }
  async getPackage(id: PackageId) {
    const row = await this.db.package.findUnique({ where: { id } });
    return row ? toPackage(row) : null;
  }
}

/**
 * Prisma has no typed error for exclusion violations; it surfaces the driver error
 * as `PrismaClientUnknownRequestError` whose message contains `code: "23P01"`.
 * Match that exact token: the message also embeds caller source code, so looser
 * matching can misfire.
 */
const EXCLUSION_VIOLATION = /\bcode: "23P01"/;

function isExclusionViolation(e: unknown): boolean {
  return (
    (e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientKnownRequestError) &&
    EXCLUSION_VIOLATION.test(e.message)
  );
}

function isUniqueOn(e: unknown, field: string): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return false;
  const target = (e.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(target) ? target.includes(field) : String(target ?? "").includes(field);
}

export class PrismaBookingRepository implements BookingRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: BookingId) {
    const row = await this.db.booking.findUnique({ where: { id } });
    return row ? toBooking(row) : null;
  }
  async findByIdempotencyKey(key: string) {
    const row = await this.db.booking.findUnique({ where: { idempotencyKey: key } });
    return row ? toBooking(row) : null;
  }
  async listForCustomer(customerId: UserId) {
    const rows = await this.db.booking.findMany({ where: { customerId }, orderBy: { startsAt: "desc" }, take: 100 });
    return rows.map(toBooking);
  }
  async busyIntervals(locationId: LocationId, from: Date, to: Date) {
    const rows = await this.db.booking.findMany({
      where: { locationId, status: { in: activeStatuses }, startsAt: { lt: to }, endsAt: { gt: from } },
      select: { bayId: true, startsAt: true, endsAt: true },
    });
    const map = new Map<BayId, Interval[]>();
    for (const r of rows) {
      const bay = asId<BayId>(r.bayId);
      const list = map.get(bay) ?? [];
      list.push({ start: r.startsAt, end: r.endsAt });
      map.set(bay, list);
    }
    return map;
  }
  async insert(b: NewBooking): Promise<InsertBookingOutcome> {
    try {
      // Concurrent inserts checking the same exclusion constraint can deadlock (40P01)
      // instead of failing cleanly. A transaction-scoped advisory lock per bay serialises
      // them: the loser waits a few ms, then fails cleanly on the constraint. Different bays never block.
      const row = await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${b.bayId}, 0))`;
        return tx.booking.create({ data: { ...b } });
      });
      return { kind: "inserted", booking: toBooking(row) };
    } catch (e) {
      if (isUniqueOn(e, "idempotencyKey")) return { kind: "duplicateIdempotencyKey" };
      if (isExclusionViolation(e)) return { kind: "bayTaken" };
      throw e;
    }
  }
  async update(id: BookingId, expectedVersion: number, patch: Parameters<BookingRepository["update"]>[2]) {
    // updateMany lets us put the version in the WHERE clause (compare-and-set).
    const { count } = await this.db.booking.updateMany({
      where: { id, version: expectedVersion },
      data: { ...patch, version: { increment: 1 } },
    });
    if (count === 0) return null;
    return this.findById(id);
  }
  async expireStaleHolds(now: Date) {
    const { count } = await this.db.booking.updateMany({
      where: { status: "PENDING_PAYMENT", holdExpiresAt: { lt: now } },
      data: { status: "EXPIRED", holdExpiresAt: null, version: { increment: 1 } },
    });
    return count;
  }
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaClient) {}

  async upsertByEmail(email: string) {
    const u = await this.db.user.upsert({ where: { email }, update: {}, create: { email } });
    return { id: asId<UserId>(u.id), email: u.email, role: u.role };
  }
  async findById(id: UserId) {
    const u = await this.db.user.findUnique({ where: { id } });
    return u ? { id: asId<UserId>(u.id), email: u.email, role: u.role } : null;
  }
}

export class PrismaWebhookEventLog implements WebhookEventLog {
  constructor(private readonly db: PrismaClient) {}

  async has(eventId: string) {
    return (await this.db.processedWebhookEvent.findUnique({ where: { eventId } })) !== null;
  }
  async record(eventId: string, type: string) {
    await this.db.processedWebhookEvent.upsert({ where: { eventId }, update: {}, create: { eventId, type } });
  }
}
