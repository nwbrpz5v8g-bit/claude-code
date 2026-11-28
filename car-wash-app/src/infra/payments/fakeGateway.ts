import { ok, type Result } from "@/domain/shared/result";
import type { CheckoutRequest, PaymentError, PaymentGateway } from "@/application/ports/payments";

/**
 * Local-development gateway: "checkout" is an in-app page that simulates the
 * provider and posts a payment event through the same use case as Stripe's webhook.
 */
export class FakeGateway implements PaymentGateway {
  constructor(private readonly appUrl: string) {}

  async createCheckout(req: CheckoutRequest): Promise<Result<{ checkoutUrl: string; paymentRef: string }, PaymentError>> {
    const paymentRef = `fake_${req.bookingId}`;
    return ok({ checkoutUrl: `${this.appUrl}/dev/checkout/${req.bookingId}`, paymentRef });
  }

  async resumeCheckout(paymentRef: string): Promise<Result<{ checkoutUrl: string } | null, PaymentError>> {
    const bookingId = paymentRef.replace(/^fake_/, "");
    return ok({ checkoutUrl: `${this.appUrl}/dev/checkout/${bookingId}` });
  }

  async refund(): Promise<Result<void, PaymentError>> {
    return ok(undefined);
  }
}
