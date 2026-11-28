import type { Result } from "@/domain/shared/result";
import type { BookingId } from "@/domain/shared/ids";

export type PaymentError = { readonly retryable: boolean; readonly message: string };

export type CheckoutRequest = {
  readonly bookingId: BookingId;
  readonly description: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly customerEmail: string;
  readonly expiresAt: Date;
  readonly idempotencyKey: string;
};

export interface PaymentGateway {
  createCheckout(req: CheckoutRequest): Promise<Result<{ checkoutUrl: string; paymentRef: string }, PaymentError>>;
  /** URL to resume an open checkout, or null if it is no longer payable. */
  resumeCheckout(paymentRef: string): Promise<Result<{ checkoutUrl: string } | null, PaymentError>>;
  /** `paymentRef` is the gateway's id returned by createCheckout or a confirmed payment. */
  refund(paymentRef: string, amountCents: number, idempotencyKey: string): Promise<Result<void, PaymentError>>;
}
