import { notFound } from "next/navigation";
import { z } from "zod";
import { asId } from "@/domain/shared/ids";
import { getBooking } from "@/application/use-cases/queries";
import { container } from "@/server/container";
import { currentActor } from "@/server/auth/session";
import { formatPrice } from "../../../_lib/format";
import { FakeCheckout } from "./FakeCheckout";

export const dynamic = "force-dynamic";

/** Stand-in for the payment provider's hosted page. Unavailable when Stripe is configured. */
export default async function FakeCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = container();
  if (c.stripe || !z.string().uuid().safeParse(id).success) notFound();
  const result = await getBooking(c, await currentActor(), asId(id));
  if (!result.ok) notFound();
  const b = result.value;
  return (
    <div className="panel" style={{ maxWidth: 460, margin: "24px auto" }}>
      <p className="notice warn" style={{ fontSize: 14 }}>Test checkout: no real payment is taken.</p>
      <p className="eyebrow">Checkout</p>
      <h1>{formatPrice(b.priceCents, b.currency)}</h1>
      <p className="muted">{b.packageName}</p>
      <FakeCheckout bookingId={b.id} />
    </div>
  );
}
