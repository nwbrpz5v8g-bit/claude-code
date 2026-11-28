import { err, ok, type Result } from "@/domain/shared/result";
import type { DomainError } from "@/domain/shared/errors";
import type { Booking } from "@/domain/booking/booking";
import type { BookingId } from "@/domain/shared/ids";
import type { Actor } from "../actor";
import { isStaffOrAdmin } from "../actor";
import type { BookingRepository } from "../ports/repositories";

export async function getBooking(
  deps: { bookings: BookingRepository },
  actor: Actor,
  id: BookingId,
): Promise<Result<Booking, DomainError>> {
  if (actor.kind === "anonymous") return err({ kind: "Unauthenticated" });
  const booking = await deps.bookings.findById(id);
  if (!booking || (booking.customerId !== actor.id && !isStaffOrAdmin(actor))) {
    return err({ kind: "NotFound", entity: "Booking" });
  }
  return ok(booking);
}

export async function listMyBookings(
  deps: { bookings: BookingRepository },
  actor: Actor,
): Promise<Result<ReadonlyArray<Booking>, DomainError>> {
  if (actor.kind === "anonymous") return err({ kind: "Unauthenticated" });
  return ok(await deps.bookings.listForCustomer(actor.id));
}
