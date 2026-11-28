import { z } from "zod";
import { asId } from "@/domain/shared/ids";
import { err } from "@/domain/shared/result";
import { handlePaymentEvent } from "@/application/use-cases/confirmPayment";
import { getBooking } from "@/application/use-cases/queries";
import { container } from "@/server/container";
import { readJson, route, zodIssues } from "@/server/http/handler";
import { errorToResponse } from "@/server/http/errorToResponse";

const body = z.object({ outcome: z.enum(["pay", "abandon"]) });

/** Simulated provider callback for the fake gateway. Disabled whenever Stripe is configured. */
export const POST = route<{ id: string }>(null, async ({ actor, req, params }) => {
  const c = container();
  if (c.stripe || !z.string().uuid().safeParse(params.id).success) return errorToResponse({ kind: "NotFound", entity: "Booking" });
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return err(zodIssues(parsed.error));

  const booking = await getBooking(c, actor, asId(params.id));
  if (!booking.ok) return booking;

  const eventId = `fake_evt_${crypto.randomUUID()}`;
  return handlePaymentEvent(
    c,
    parsed.data.outcome === "pay"
      ? { kind: "paid", eventId, bookingId: booking.value.id, paymentRef: `fake_${booking.value.id}`, amountCents: booking.value.priceCents }
      : { kind: "checkoutExpired", eventId, bookingId: booking.value.id },
  );
});
