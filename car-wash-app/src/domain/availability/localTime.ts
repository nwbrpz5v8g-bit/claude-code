import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidLocalDate(date: string): boolean {
  const m = DATE_RE.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isValidWallTime(time: string): boolean {
  return TIME_RE.test(time);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Day of week (0 = Sunday) of a calendar date. Independent of any time zone. */
export function dayOfWeek(localDate: string): number {
  const [y, m, d] = localDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

export function addDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

/** Today's calendar date in `tz`. */
export function localDateOf(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, "yyyy-MM-dd");
}

/**
 * Resolve a local wall time to a UTC instant.
 * - Nonexistent times (spring-forward gap) resolve to the first valid instant after the gap.
 * - Ambiguous times (fall-back overlap) resolve to the earlier instant.
 */
export function wallTimeToUtc(localDate: string, wallTime: string, tz: string): Date {
  const candidate = fromZonedTime(`${localDate}T${wallTime}:00`, tz);
  // date-fns-tz shifts gap times by the DST delta; normalise to "first instant after the gap".
  const roundTrip = formatInTimeZone(candidate, tz, "yyyy-MM-dd'T'HH:mm");
  if (roundTrip === `${localDate}T${wallTime}`) return candidate;
  // In a gap: walk forward minute by minute (gaps are at most a few hours) to the first valid instant.
  const startOfGapGuess = candidate.getTime() - 3 * 3_600_000;
  for (let t = startOfGapGuess; t <= candidate.getTime() + 3 * 3_600_000; t += 60_000) {
    const wall = formatInTimeZone(new Date(t), tz, "yyyy-MM-dd'T'HH:mm");
    if (wall > `${localDate}T${wallTime}`) return new Date(t);
  }
  return candidate;
}

export function formatLocal(instant: Date, tz: string): { time: string; zoneAbbr: string } {
  return {
    time: formatInTimeZone(instant, tz, "HH:mm"),
    zoneAbbr: formatInTimeZone(instant, tz, "zzz"),
  };
}
