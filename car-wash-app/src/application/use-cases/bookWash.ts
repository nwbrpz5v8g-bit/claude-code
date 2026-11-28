import { PAYMENT_HOLD_MINUTES, type Booking } from "@/domain/booking/booking";
import { localDateOf } from "@/domain/availability/localTime";
import { quoteSlot } from "@/domain/pricing/quote";
import { err, ok, type Result } from "@/domain/shared/result";
import type { DomainError } from "@/domain/shared/errors";
import type { BookingId, LocationId, PackageId } from "@/domain/shared/ids";
import type { Actor } from "../actor";
import type { BookingRepository, CatalogRepository } from "../ports/repositories";
import type { PaymentGateway } from "../ports/payments";
import type { Clock, Logger } from "../ports/system";
import { slotsFor } from "./getAvailability";

export type BookWashDeps = {
  catalog: CatalogRepository;
  bookings: BookingRepository;
  payments: PaymentGateway;
  clock: Clock;
  logger: Logger;
};

export type BookWashInput = {
  locationId: LocationId;
  packageId: PackageId;
  /** UTC instant of the chosen slot, exactly as returned by availability. */
  startsAt: Date;
  /** Slot price the customer saw (after any discount). If it changed since, we refuse rather than surprise-charge. */
  expectedPriceCents: number;
  /** Client-generated per checkout attempt; makes retries and double-clicks safe. */
  idempotencyKey: string;
};

export type BookWashOutput = { bookingId: BookingId; checkoutUrl: string | null; status: Booking["status"] };

export async function bookWash(
  deps: BookWashDeps,
  actor: Actor,
  input: BookWashInput,
): Promise<Result<BookWashOutput, DomainError>> {
  if (actor.kind === "anonymous") return err({ kind: "Unauthenticated" });

  // 1. Idempotent replay: same key returns the same booking, never a second one.
  const existing = await deps.bookings.findByIdempotencyKey(input.idempotencyKey);
  if (existing) return replay(deps, existing, actor, input);

  // 2. Load and validate catalog state.
  const [location, pkg] = await Promise.all([
    deps.catalog.getLocation(input.locationId),
    deps.catalog.getPackage(input.packageId),
  ]);
  if (!location || !location.isActive) return err({ kind: "NotFound", entity: "Location" });
  if (!pkg || !pkg.isActive) return err({ kind: "NotFound", entity: "Package" });

  // 3. Re-derive the slot server-side. Never trust a client-supplied time or bay.
  const now = deps.clock.now();
  await deps.bookings.expireStaleHolds(now);
  const localDate = localDateOf(input.startsAt, location.timezone);
  const day = await slotsFor(deps, location, pkg, localDate, now);
  if (day.closedReason) return err({ kind: "LocationClosed", date: localDate, reason: day.closedReason });
  const slot = day.slots.find((s) => s.startsAt.getTime() === input.startsAt.getTime());
  if (!slot) return err({ kind: "SlotUnavailable", startsAt: input.startsAt.toISOString() });

  // 3b. Price the slot server-side (Quiet Hours discount) and make sure it matches what the customer saw.
  const quote = quoteSlot({
    basePriceCents: pkg.priceCents,
    startsAt: slot.startsAt,
    timezone: location.timezone,
    freeBays: slot.freeBayIds.length,
    totalBays: location.activeBayIds.length,
  });
  if (quote.priceCents !== input.expectedPriceCents) {
    return err({ kind: "Validation", issues: [{ path: "expectedPriceCents", message: "The price has changed; please review and try again" }] });
  }

  // 4. Claim a bay. The DB exclusion constraint is the source of truth under concurrency:
  //    if another request won the race for a bay, try the next free one.
  const holdExpiresAt = new Date(now.getTime() + PAYMENT_HOLD_MINUTES * 60_000);
  let booking: Booking | null = null;
  for (const bayId of slot.freeBayIds) {
    const outcome = await deps.bookings.insert({
      customerId: actor.id,
      locationId: location.id,
      bayId,
      packageId: pkg.id,
      packageName: pkg.name,
      priceCents: quote.priceCents,
      currency: pkg.currency,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      status: "PENDING_PAYMENT",
      idempotencyKey: input.idempotencyKey,
      holdExpiresAt,
    });
    if (outcome.kind === "inserted") {
      booking = outcome.booking;
      break;
    }
    if (outcome.kind === "duplicateIdempotencyKey") {
      // A concurrent request with the same key won; return its result.
      const winner = await deps.bookings.findByIdempotencyKey(input.idempotencyKey);
      if (winner) return replay(deps, winner, actor, input);
      return err({ kind: "Conflict", reason: "IdempotencyKeyReuse" });
    }
  }
  if (!booking) return err({ kind: "SlotUnavailable", startsAt: slot.startsAt.toISOString() });

  // 5. Start payment. No DB transaction is held open across this network call;
  //    on failure we compensate by releasing the hold.
  const checkout = await deps.payments.createCheckout({
    bookingId: booking.id,
    description: `${pkg.name} at ${location.name}`,
    amountCents: booking.priceCents,
    currency: booking.currency,
    customerEmail: actor.email,
    expiresAt: holdExpiresAt,
    idempotencyKey: input.idempotencyKey,
  });
  if (!checkout.ok) {
    deps.logger.warn("checkout creation failed; releasing hold", { bookingId: booking.id, retryable: checkout.error.retryable });
    await deps.bookings.update(booking.id, booking.version, { status: "CANCELLED", holdExpiresAt: null });
    return err({ kind: "PaymentFailed", retryable: checkout.error.retryable });
  }

  const updated = await deps.bookings.update(booking.id, booking.version, { paymentRef: checkout.value.paymentRef });
  if (!updated) deps.logger.warn("booking changed while attaching payment ref", { bookingId: booking.id });
  return ok({ bookingId: booking.id, checkoutUrl: checkout.value.checkoutUrl, status: booking.status });
}

async function replay(
  deps: Pick<BookWashDeps, "payments">,
  existing: Booking,
  actor: Extract<Actor, { kind: "user" }>,
  input: BookWashInput,
): Promise<Result<BookWashOutput, DomainError>> {
  const sameRequest =
    existing.customerId === actor.id &&
    existing.locationId === input.locationId &&
    existing.packageId === input.packageId &&
    existing.startsAt.getTime() === input.startsAt.getTime();
  if (!sameRequest) return err({ kind: "Conflict", reason: "IdempotencyKeyReuse" });

  let checkoutUrl: string | null = null;
  if (existing.status === "PENDING_PAYMENT" && existing.paymentRef) {
    const resumed = await deps.payments.resumeCheckout(existing.paymentRef);
    if (resumed.ok && resumed.value) checkoutUrl = resumed.value.checkoutUrl;
  }
  return ok({ bookingId: existing.id, checkoutUrl, status: existing.status });
}
