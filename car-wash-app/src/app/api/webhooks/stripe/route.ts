import type Stripe from "stripe";
import { env } from "@/config/env";
import { asId } from "@/domain/shared/ids";
import { handlePaymentEvent, type PaymentEvent } from "@/application/use-cases/confirmPayment";
import { container } from "@/server/container";

/** Translates a Stripe event into our provider-neutral PaymentEvent, or null if we do not care about it. */
function toPaymentEvent(event: Stripe.Event): PaymentEvent | null {
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded" && event.type !== "checkout.session.expired") {
    return null;
  }
  const session = event.data.object;
  const bookingId = session.metadata?.bookingId;
  if (!bookingId) return null;
  if (event.type === "checkout.session.expired") return { kind: "checkoutExpired", eventId: event.id, bookingId: asId(bookingId) };
  if (session.payment_status !== "paid") return null; // async methods confirm later via async_payment_succeeded
  const paymentRef = typeof session.payment_intent === "string" ? session.payment_intent : session.id;
  return { kind: "paid", eventId: event.id, bookingId: asId(bookingId), paymentRef, amountCents: session.amount_total ?? 0 };
}

export async function POST(req: Request): Promise<Response> {
  const c = container();
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!c.stripe || !secret) return new Response("Stripe not configured", { status: 404 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  const event = c.stripe.verifyWebhook(await req.text(), signature, secret);
  if (!event) return new Response("Invalid signature", { status: 400 });

  const paymentEvent = toPaymentEvent(event);
  if (!paymentEvent) return new Response("ignored", { status: 200 });

  try {
    const result = await handlePaymentEvent(c, paymentEvent);
    if (result.ok) return new Response(result.value, { status: 200 });
    // Non-2xx makes Stripe retry with backoff, which is what we want for conflicts and refund failures.
    c.logger.warn("payment event not processed", { eventId: event.id, error: result.error.kind });
    return new Response(result.error.kind, { status: 409 });
  } catch (e) {
    c.logger.error("payment webhook failed", { eventId: event.id, error: e instanceof Error ? e.message : String(e) });
    return new Response("error", { status: 500 });
  }
}
