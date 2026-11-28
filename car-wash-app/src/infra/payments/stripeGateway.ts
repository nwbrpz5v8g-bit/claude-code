import Stripe from "stripe";
import { err, ok, type Result } from "@/domain/shared/result";
import type { CheckoutRequest, PaymentError, PaymentGateway } from "@/application/ports/payments";

/** Stripe Checkout requires expires_at at least 30 minutes ahead. */
const STRIPE_MIN_EXPIRY_MS = 30 * 60_000 + 5_000;

function toPaymentError(e: unknown): PaymentError {
  if (e instanceof Stripe.errors.StripeError) {
    const retryable =
      e instanceof Stripe.errors.StripeConnectionError ||
      e instanceof Stripe.errors.StripeRateLimitError ||
      e instanceof Stripe.errors.StripeAPIError;
    return { retryable, message: `${e.type}: ${e.message}` };
  }
  return { retryable: false, message: e instanceof Error ? e.message : "unknown error" };
}

export class StripeGateway implements PaymentGateway {
  private readonly stripe: Stripe;

  constructor(secretKey: string, private readonly appUrl: string) {
    // maxNetworkRetries applies exponential backoff on 429s and network errors.
    this.stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 10_000 });
  }

  async createCheckout(req: CheckoutRequest): Promise<Result<{ checkoutUrl: string; paymentRef: string }, PaymentError>> {
    try {
      const expiresAt = Math.max(req.expiresAt.getTime(), Date.now() + STRIPE_MIN_EXPIRY_MS);
      const session = await this.stripe.checkout.sessions.create(
        {
          mode: "payment",
          customer_email: req.customerEmail,
          client_reference_id: req.bookingId,
          metadata: { bookingId: req.bookingId },
          payment_intent_data: { metadata: { bookingId: req.bookingId } },
          expires_at: Math.floor(expiresAt / 1000),
          line_items: [
            {
              quantity: 1,
              price_data: { currency: req.currency, unit_amount: req.amountCents, product_data: { name: req.description } },
            },
          ],
          success_url: `${this.appUrl}/bookings/${req.bookingId}?paid=1`,
          cancel_url: `${this.appUrl}/bookings/${req.bookingId}`,
        },
        { idempotencyKey: `checkout:${req.idempotencyKey}` },
      );
      if (!session.url) return err({ retryable: true, message: "Stripe returned no checkout URL" });
      return ok({ checkoutUrl: session.url, paymentRef: session.id });
    } catch (e) {
      return err(toPaymentError(e));
    }
  }

  async resumeCheckout(paymentRef: string): Promise<Result<{ checkoutUrl: string } | null, PaymentError>> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(paymentRef);
      return ok(session.status === "open" && session.url ? { checkoutUrl: session.url } : null);
    } catch (e) {
      return err(toPaymentError(e));
    }
  }

  async refund(paymentRef: string, amountCents: number, idempotencyKey: string): Promise<Result<void, PaymentError>> {
    try {
      // paymentRef is either a Checkout Session id (cs_...) or a PaymentIntent id (pi_...).
      let paymentIntent = paymentRef;
      if (paymentRef.startsWith("cs_")) {
        const session = await this.stripe.checkout.sessions.retrieve(paymentRef);
        if (typeof session.payment_intent !== "string") return err({ retryable: false, message: "Session has no payment" });
        paymentIntent = session.payment_intent;
      }
      await this.stripe.refunds.create({ payment_intent: paymentIntent, amount: amountCents }, { idempotencyKey });
      return ok(undefined);
    } catch (e) {
      return err(toPaymentError(e));
    }
  }

  /** Verifies the signature and returns the parsed event, or null if invalid. */
  verifyWebhook(payload: string, signature: string, secret: string): Stripe.Event | null {
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, secret);
    } catch {
      return null;
    }
  }
}
