import type { BayId } from "../shared/ids";
import { dayOfWeek, formatLocal, wallTimeToUtc } from "./localTime";

export type DailyHours = { readonly dayOfWeek: number; readonly opensAt: string; readonly closesAt: string };
export type Interval = { readonly start: Date; readonly end: Date };

export type AvailabilityInput = {
  readonly timezone: string;
  readonly localDate: string; // "YYYY-MM-DD" in `timezone`
  readonly hours: ReadonlyArray<DailyHours>;
  readonly blackoutDates: ReadonlyArray<{ date: string; reason: string }>;
  readonly slotIntervalMin: number;
  readonly durationMin: number;
  readonly minLeadTimeMin: number;
  readonly bayIds: ReadonlyArray<BayId>;
  /** Busy intervals of active bookings, per bay. */
  readonly busy: ReadonlyMap<BayId, ReadonlyArray<Interval>>;
  readonly now: Date;
};

export type Slot = {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly localTime: string; // "HH:mm" in the location's zone
  readonly zoneAbbr: string; // disambiguates repeated hours on fall-back days
  readonly freeBayIds: ReadonlyArray<BayId>;
};

export type DayAvailability =
  | { kind: "closed"; reason: string }
  | { kind: "open"; slots: ReadonlyArray<Slot> };

const MIN = 60_000;

const overlaps = (a: Interval, b: Interval): boolean =>
  a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();

/**
 * Pure slot generation.
 *
 * Opening and closing wall times are resolved to UTC once, then slots step in
 * real (UTC) time. On DST transition days that gives the right number of real
 * slots: no slot labelled with a nonexistent local time on spring-forward days,
 * and two distinct slots (different zone abbreviations) for the repeated hour
 * on fall-back days.
 */
export function computeDayAvailability(input: AvailabilityInput): DayAvailability {
  const blackout = input.blackoutDates.find((b) => b.date === input.localDate);
  if (blackout) return { kind: "closed", reason: blackout.reason };

  const hours = input.hours.find((h) => h.dayOfWeek === dayOfWeek(input.localDate));
  if (!hours) return { kind: "closed", reason: "Closed on this day" };
  if (input.bayIds.length === 0) return { kind: "closed", reason: "No bays available" };

  const open = wallTimeToUtc(input.localDate, hours.opensAt, input.timezone).getTime();
  const close = wallTimeToUtc(input.localDate, hours.closesAt, input.timezone).getTime();
  const earliest = input.now.getTime() + input.minLeadTimeMin * MIN;
  const step = input.slotIntervalMin * MIN;
  const duration = input.durationMin * MIN;

  const slots: Slot[] = [];
  for (let t = open; t + duration <= close; t += step) {
    if (t < earliest) continue;
    const candidate: Interval = { start: new Date(t), end: new Date(t + duration) };
    const freeBayIds = input.bayIds.filter(
      (bay) => !(input.busy.get(bay) ?? []).some((b) => overlaps(b, candidate)),
    );
    if (freeBayIds.length === 0) continue;
    const { time, zoneAbbr } = formatLocal(candidate.start, input.timezone);
    slots.push({ startsAt: candidate.start, endsAt: candidate.end, localTime: time, zoneAbbr, freeBayIds });
  }
  return { kind: "open", slots };
}
