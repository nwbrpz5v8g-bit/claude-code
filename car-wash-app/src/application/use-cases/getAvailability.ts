import { addDays, isValidLocalDate, localDateOf, wallTimeToUtc } from "@/domain/availability/localTime";
import { computeDayAvailability, type Slot } from "@/domain/availability/slots";
import { err, ok, type Result } from "@/domain/shared/result";
import { validation, type DomainError } from "@/domain/shared/errors";
import type { LocationId, PackageId } from "@/domain/shared/ids";
import type { BookingRepository, CatalogRepository, LocationRecord, PackageRecord } from "../ports/repositories";
import type { Clock } from "../ports/system";

export type AvailabilityDeps = { catalog: CatalogRepository; bookings: BookingRepository; clock: Clock };

export type AvailabilityQuery = { locationId: LocationId; packageId: PackageId; localDate?: string };

export type AvailabilityView = {
  readonly location: { id: LocationId; name: string; timezone: string };
  readonly localDate: string;
  readonly closedReason: string | null;
  readonly slots: ReadonlyArray<Omit<Slot, "freeBayIds"> & { freeBays: number }>;
  /** When the requested day has no slots, the next day (within the search horizon) that does. */
  readonly nextAvailableDate: string | null;
};

export const MAX_DAYS_AHEAD = 30;
const NEXT_DAY_SEARCH_HORIZON = 14;

export async function getAvailability(
  deps: AvailabilityDeps,
  query: AvailabilityQuery,
): Promise<Result<AvailabilityView, DomainError>> {
  const [location, pkg] = await Promise.all([
    deps.catalog.getLocation(query.locationId),
    deps.catalog.getPackage(query.packageId),
  ]);
  if (!location || !location.isActive) return err({ kind: "NotFound", entity: "Location" });
  if (!pkg || !pkg.isActive) return err({ kind: "NotFound", entity: "Package" });

  const now = deps.clock.now();
  const today = localDateOf(now, location.timezone);
  const localDate = query.localDate ?? today;
  if (!isValidLocalDate(localDate)) return err(validation("date", "Expected YYYY-MM-DD"));
  if (localDate < today) return err(validation("date", "Date is in the past"));
  if (localDate > addDays(today, MAX_DAYS_AHEAD)) {
    return err(validation("date", `Bookings open at most ${MAX_DAYS_AHEAD} days ahead`));
  }

  await deps.bookings.expireStaleHolds(now);

  const day = await slotsFor(deps, location, pkg, localDate, now);
  let nextAvailableDate: string | null = null;
  if (day.slots.length === 0) {
    for (let i = 1; i <= NEXT_DAY_SEARCH_HORIZON; i++) {
      const candidate = addDays(localDate, i);
      if (candidate > addDays(today, MAX_DAYS_AHEAD)) break;
      if ((await slotsFor(deps, location, pkg, candidate, now)).slots.length > 0) {
        nextAvailableDate = candidate;
        break;
      }
    }
  }

  return ok({
    location: { id: location.id, name: location.name, timezone: location.timezone },
    localDate,
    closedReason: day.closedReason,
    slots: day.slots.map(({ freeBayIds, ...s }) => ({ ...s, freeBays: freeBayIds.length })),
    nextAvailableDate,
  });
}

/** Shared with bookWash so the server re-derives the slot instead of trusting the client. */
export async function slotsFor(
  deps: Pick<AvailabilityDeps, "bookings">,
  location: LocationRecord,
  pkg: PackageRecord,
  localDate: string,
  now: Date,
): Promise<{ closedReason: string | null; slots: ReadonlyArray<Slot> }> {
  // Query a window wide enough to cover the whole local day plus the package duration.
  const from = wallTimeToUtc(localDate, "00:00", location.timezone);
  const to = new Date(wallTimeToUtc(addDays(localDate, 1), "00:00", location.timezone).getTime() + pkg.durationMin * 60_000);
  const busy = await deps.bookings.busyIntervals(location.id, from, to);
  const day = computeDayAvailability({
    timezone: location.timezone,
    localDate,
    hours: location.hours,
    blackoutDates: location.blackoutDates,
    slotIntervalMin: location.slotIntervalMin,
    durationMin: pkg.durationMin,
    minLeadTimeMin: location.minLeadTimeMin,
    bayIds: location.activeBayIds,
    busy,
    now,
  });
  return day.kind === "closed" ? { closedReason: day.reason, slots: [] } : { closedReason: null, slots: day.slots };
}
