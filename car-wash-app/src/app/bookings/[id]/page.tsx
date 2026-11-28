import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { asId } from "@/domain/shared/ids";
import { ACTIVE_STATUSES } from "@/domain/booking/booking";
import { checkInCode } from "@/domain/booking/checkInCode";
import { decideCustomerCancellation } from "@/domain/booking/cancellationPolicy";
import { getBooking } from "@/application/use-cases/queries";
import { container } from "@/server/container";
import { currentActor } from "@/server/auth/session";
import { formatInZone, formatPrice, STATUS_LABEL, zoneName } from "../../_lib/format";
import { Burst } from "../../_components/Burst";
import { CancelButton } from "./CancelButton";

export const dynamic = "force-dynamic";

export default async function WashPassPage({
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
  const live = ACTIVE_STATUSES.has(b.status);
  const minutesLeft = b.holdExpiresAt ? Math.max(0, Math.ceil((b.holdExpiresAt.getTime() - now.getTime()) / 60_000)) : 0;

  return (
    <>
      {paid && b.status === "CONFIRMED" && <Burst />}
      <p><Link href="/bookings">← All Wash Passes</Link></p>

      {paid && b.status === "CONFIRMED" && <p className="eyebrow" style={{ fontSize: 14 }}>You're booked. See you at the bay! 🫧</p>}

      <article className={`pass${live ? "" : " void"}`} aria-label="Wash Pass">
        <div className="pass-main">
          <span className="chip pass-status" style={{ background: "rgb(255 255 255 / .12)", color: "#fff", borderColor: "rgb(255 255 255 / .2)" }}>
            {STATUS_LABEL[b.status]}
          </span>
          <div className="label">Wash Pass</div>
          <h1>{b.packageName}</h1>
          <div className="pass-grid">
            <div>
              <div className="label">When</div>
              <div className="value">{formatInZone(b.startsAt, tz, { timeZoneName: undefined })}</div>
              <div style={{ color: "#93a3cc", fontSize: 13 }}>{zoneName(b.startsAt, tz)}</div>
            </div>
            <div>
              <div className="label">Where</div>
              <div className="value">{location?.name ?? "Location closed"}</div>
              <div style={{ color: "#93a3cc", fontSize: 13 }}>{location?.address}</div>
            </div>
            <div>
              <div className="label">Paid</div>
              <div className="value">{formatPrice(b.priceCents, b.currency)}</div>
              {b.refundedCents > 0 && <div style={{ color: "var(--aqua)", fontSize: 13 }}>Refunded {formatPrice(b.refundedCents, b.currency)}</div>}
            </div>
          </div>
        </div>
        <div className="pass-stub">
          <div className="label" style={{ color: "#070d22" }}>Check-in code</div>
          <div className="code">{checkInCode(b.id)}</div>
          <div style={{ fontSize: 13 }}>{live ? "Read this out at the bay" : "No longer valid"}</div>
        </div>
      </article>

      <div style={{ marginTop: 20 }}>
        {b.status === "PENDING_PAYMENT" && (
          <div className="notice warn">
            {paid
              ? "Payment's on its way. We're waiting for your bank to confirm. Refresh in a few seconds."
              : `Your bay is held for ${minutesLeft} more minute${minutesLeft === 1 ? "" : "s"}. Pay to lock it in.`}
          </div>
        )}
        {b.status === "EXPIRED" && (
          <div className="notice warn">
            The hold ran dry before payment, so the bay went back in the pool. <Link href={`/book/${b.locationId}`}>Grab another slot</Link>
          </div>
        )}
        <div className="row">
          {resumeUrl && <a className="btn btn-primary btn-lg" href={resumeUrl}>Finish payment →</a>}
          {cancel.ok && (
            <CancelButton
              bookingId={b.id}
              version={b.version}
              refundText={
                b.status === "PENDING_PAYMENT"
                  ? "You haven't been charged."
                  : cancel.value.refundCents > 0
                    ? `You'll get ${formatPrice(cancel.value.refundCents, b.currency)} back${cancel.value.kind === "partial" ? " (50%, it's within 24 hours)" : ""}.`
                    : "It's under 2 hours to go, so this one isn't refundable."
              }
            />
          )}
        </div>
      </div>
    </>
  );
}
