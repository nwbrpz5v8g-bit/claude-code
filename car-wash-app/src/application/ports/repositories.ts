import type { Booking } from "@/domain/booking/booking";
import type { DailyHours, Interval } from "@/domain/availability/slots";
import type { BayId, BookingId, LocationId, PackageId, UserId } from "@/domain/shared/ids";

export type Role = "CUSTOMER" | "STAFF" | "ADMIN";

export type LocationRecord = {
  readonly id: LocationId;
  readonly name: string;
  readonly address: string;
  readonly timezone: string;
  readonly slotIntervalMin: number;
  readonly minLeadTimeMin: number;
  readonly isActive: boolean;
  readonly hours: ReadonlyArray<DailyHours>;
  readonly blackoutDates: ReadonlyArray<{ date: string; reason: string }>;
  readonly activeBayIds: ReadonlyArray<BayId>;
};

export type PackageRecord = {
  readonly id: PackageId;
  readonly code: string;
  readonly version: number;
  readonly name: string;
  readonly description: string;
  readonly durationMin: number;
  readonly priceCents: number;
  readonly currency: string;
  readonly isActive: boolean;
};

export interface CatalogRepository {
  listActiveLocations(): Promise<ReadonlyArray<LocationRecord>>;
  getLocation(id: LocationId): Promise<LocationRecord | null>;
  listActivePackages(): Promise<ReadonlyArray<PackageRecord>>;
  getPackage(id: PackageId): Promise<PackageRecord | null>;
}

export type NewBooking = Omit<Booking, "id" | "version" | "paymentRef" | "refundedCents">;

export type InsertBookingOutcome =
  | { kind: "inserted"; booking: Booking }
  | { kind: "bayTaken" } // exclusion constraint violation
  | { kind: "duplicateIdempotencyKey" };

export interface BookingRepository {
  findById(id: BookingId): Promise<Booking | null>;
  findByIdempotencyKey(key: string): Promise<Booking | null>;
  listForCustomer(customerId: UserId): Promise<ReadonlyArray<Booking>>;
  /** Busy intervals of active bookings at a location, overlapping [from, to). */
  busyIntervals(locationId: LocationId, from: Date, to: Date): Promise<ReadonlyMap<BayId, ReadonlyArray<Interval>>>;
  /** Atomic insert; the database guarantees no overlap on the same bay. */
  insert(booking: NewBooking): Promise<InsertBookingOutcome>;
  /**
   * Optimistic-locked update. Returns null if `expectedVersion` is stale.
   */
  update(
    id: BookingId,
    expectedVersion: number,
    patch: Partial<Pick<Booking, "status" | "paymentRef" | "refundedCents" | "holdExpiresAt">>,
  ): Promise<Booking | null>;
  /** Moves PENDING_PAYMENT bookings whose hold has lapsed to EXPIRED. Returns the count. */
  expireStaleHolds(now: Date): Promise<number>;
}

export interface UserRepository {
  upsertByEmail(email: string): Promise<{ id: UserId; email: string; role: Role }>;
  findById(id: UserId): Promise<{ id: UserId; email: string; role: Role } | null>;
}

export interface WebhookEventLog {
  has(eventId: string): Promise<boolean>;
  /** Idempotent: recording an already-recorded id is a no-op. */
  record(eventId: string, type: string): Promise<void>;
}
