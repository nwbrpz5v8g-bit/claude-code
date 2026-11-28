import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { asId } from "@/domain/shared/ids";
import { decideCustomerCancellation } from "@/domain/booking/cancellationPolicy";
import { getBooking } from "@/application/use-cases/queries";
import { container } from "@/server/container";
import { currentActor } from "@/server/auth/session";
import { formatInZone, formatPrice, STATUS_LABEL } from "../../_lib/format";
import { CancelButton } from "./CancelButton";

export const dynamic = "force-dynamic";

export default async function BookingPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string }> }) {
  const [{ id }, { paid }] = await Promise.all([params, searchParams]);
  if (!z.string().uuid().safeParse(id).success) notFound();
  const actor = await currentActor();
  const c = container();
  const result = await getBooking(c, actor, asId(id));
  if (!result.ok) {
    if (result.error.kind === "Unauthenticated") redirect(`/login?returnTo=/bookings/${id}`);
    notFound();
  }
  const b = result.value;
  const location = await c.catalog.getLocation(b.locationId);
  const tz = location?.timezone ?? "UTC";
  const now = c.clock.now();

  let resumeUrl: string | null = null;
  if (b.status === "PENDING_PAYMENT" && b.paymentRef && b.holdExpiresAt && b.holdExpiresAt > now) {
    const r = await c.payments.resumeCheckout(b.paymentRef);
    if (r.ok && r.value) resumeUrl = r.value.checkoutUrl;
  }
  const cancel = decideCustomerCancellation(b, now);

  return (
    <>
      <p><Link href="/bookings">← My bookings</Link></p>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 style={{ margin: 0 }}>{b.packageName}</h1>
          <span className="badge">{STATUS_LABEL[b.status]}</span>
        </div>
        <p>
          <strong>{formatInZone(b.startsAt, tz)}</strong>
          <br />
          {location ? `${location.name}, ${location.address}` : "Location no longer listed"}
        </p>
        <p>{formatPrice(b.priceCents, b.currency)}{b.refundedCents > 0 && ` · refunded ${formatPrice(b.refundedCents, b.currency)}`}</p>

        {paid && b.status === "PENDING_PAYMENT" && (
          <p className="notice warn">We're confirming your payment. This page updates once your provider confirms it; refresh in a few seconds.</p>
        )}
        {b.status === "CONFIRMED" && paid && <p className="notice ok">Payment received. You're booked!</p>}
        {b.status === "EXPIRED" && <p className="notice warn">The payment window closed and the slot was released. <Link href={`/book/${b.locationId}`}>Book again</Link></p>}

        <div className="row">
          {resumeUrl && <a className="button primary" href={resumeUrl}>Continue to payment</a>}
          {cancel.ok && (
            <CancelButton
              bookingId={b.id}
              version={b.version}
              refundText={
                b.status === "PENDING_PAYMENT"
                  ? "You have not been charged."
                  : cancel.value.refundCents > 0
                    ? `You'll be refunded ${formatPrice(cancel.value.refundCents, b.currency)}.`
                    : "Cancelling less than 2 hours before the wash is not refunded."
              }
            />
          )}
        </div>
      </div>
    </>
  );
}
