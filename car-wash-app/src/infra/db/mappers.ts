import type { Booking as BookingRow } from "@prisma/client";
import type { Booking } from "@/domain/booking/booking";
import { asId } from "@/domain/shared/ids";

export function toBooking(row: BookingRow): Booking {
  return {
    id: asId(row.id),
    customerId: asId(row.customerId),
    locationId: asId(row.locationId),
    bayId: asId(row.bayId),
    packageId: asId(row.packageId),
    packageName: row.packageName,
    priceCents: row.priceCents,
    currency: row.currency,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    paymentRef: row.paymentRef,
    refundedCents: row.refundedCents,
    holdExpiresAt: row.holdExpiresAt,
    version: row.version,
  };
}
