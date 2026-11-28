export function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

/** Always render in the location's zone, not the viewer's: customers may be travelling. */
export function formatInZone(iso: string | Date, timeZone: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...opts,
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

/** Just the zone's long name, e.g. "Eastern Standard Time" (DST-aware for that instant). */
export function zoneName(iso: string | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "long" }).formatToParts(typeof iso === "string" ? new Date(iso) : iso);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

export const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked in",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
  EXPIRED: "Expired (not paid in time)",
};
