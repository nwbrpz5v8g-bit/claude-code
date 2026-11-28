import type { Booking } from "@/domain/booking/booking";

/** Wire format for a booking in API v1. Add fields freely; never remove or rename. */
export type BookingDto = {
  id: string;
  locationId: string;
  packageId: string;
  packageName: string;
  priceCents: number;
  currency: string;
  startsAt: string;
  endsAt: string;
  status: Booking["status"];
  refundedCents: number;
  holdExpiresAt: string | null;
  version: number;
};

export const toBookingDto = (b: Booking): BookingDto => ({
  id: b.id,
  locationId: b.locationId,
  packageId: b.packageId,
  packageName: b.packageName,
  priceCents: b.priceCents,
  currency: b.currency,
  startsAt: b.startsAt.toISOString(),
  endsAt: b.endsAt.toISOString(),
  status: b.status,
  refundedCents: b.refundedCents,
  holdExpiresAt: b.holdExpiresAt?.toISOString() ?? null,
  version: b.version,
});
