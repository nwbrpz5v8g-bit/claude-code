import { formatInTimeZone } from "date-fns-tz";

/**
 * Slot pricing and crowd level. Pure; the server recomputes this at booking
 * time, so a client can never choose its own price.
 *
 * Quiet Hours: weekday afternoons are historically the emptiest stretch at a
 * car wash. Discounting them moves demand off the weekend rush.
 */
export const QUIET_HOURS = { weekdays: [1, 2, 3, 4, 5], fromHour: 13, toHour: 16, percentOff: 20 } as const;

export type Crowd = "calm" | "steady" | "busy";

export type SlotQuote = {
  readonly basePriceCents: number;
  readonly priceCents: number;
  readonly discount: { readonly kind: "quietHours"; readonly percentOff: number } | null;
  readonly crowd: Crowd;
};

export function crowdLevel(freeBays: number, totalBays: number): Crowd {
  if (totalBays <= 0) return "busy";
  const free = freeBays / totalBays;
  if (free >= 1) return "calm";
  if (free >= 0.5) return "steady";
  return "busy";
}

export function isQuietHour(startsAt: Date, timezone: string): boolean {
  // ISO day of week: 1 = Monday … 7 = Sunday.
  const isoDay = Number(formatInTimeZone(startsAt, timezone, "i"));
  const hour = Number(formatInTimeZone(startsAt, timezone, "H"));
  return (QUIET_HOURS.weekdays as readonly number[]).includes(isoDay) && hour >= QUIET_HOURS.fromHour && hour < QUIET_HOURS.toHour;
}

export function quoteSlot(input: {
  basePriceCents: number;
  startsAt: Date;
  timezone: string;
  freeBays: number;
  totalBays: number;
}): SlotQuote {
  const quiet = isQuietHour(input.startsAt, input.timezone);
  const priceCents = quiet
    ? Math.round((input.basePriceCents * (100 - QUIET_HOURS.percentOff)) / 100)
    : input.basePriceCents;
  return {
    basePriceCents: input.basePriceCents,
    priceCents,
    discount: quiet ? { kind: "quietHours", percentOff: QUIET_HOURS.percentOff } : null,
    crowd: crowdLevel(input.freeBays, input.totalBays),
  };
}
