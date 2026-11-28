import Link from "next/link";
import { redirect } from "next/navigation";
import { ACTIVE_STATUSES, type Booking } from "@/domain/booking/booking";
import { listMyBookings } from "@/application/use-cases/queries";
import { container } from "@/server/container";
import { currentActor } from "@/server/auth/session";
import { formatInZone, formatPrice, STATUS_LABEL } from "../_lib/format";

export const dynamic = "force-dynamic";

export default async function MyPassesPage() {
  const actor = await currentActor();
  const c = container();
  const result = await listMyBookings(c, actor);
  if (!result.ok) redirect("/login?returnTo=/bookings");

  const locations = new Map((await c.catalog.listActiveLocations()).map((l) => [l.id, l]));
  const now = c.clock.now().getTime();
  const isUpcoming = (b: Booking) => ACTIVE_STATUSES.has(b.status) && b.endsAt.getTime() >= now;
  const upcoming = result.value.filter(isUpcoming).reverse(); // soonest first
  const past = result.value.filter((b) => !isUpcoming(b));

  if (result.value.length === 0) {
    return (
      <div className="panel empty">
        <div className="art" aria-hidden="true">🚙</div>
        <h1 style={{ fontSize: "2rem" }}>Your car's still dusty</h1>
        <p className="muted">Book a wash and your Wash Pass will show up here.</p>
        <Link className="btn btn-primary btn-lg" href="/">Find a bay</Link>
      </div>
    );
  }

  const ticket = (b: Booking, faded: boolean) => {
    const tz = locations.get(b.locationId)?.timezone ?? "UTC";
    const month = formatInZone(b.startsAt, tz, { weekday: undefined, day: undefined, hour: undefined, minute: undefined, timeZoneName: undefined });
    const day = formatInZone(b.startsAt, tz, { weekday: undefined, month: undefined, hour: undefined, minute: undefined, timeZoneName: undefined });
    return (
      <Link key={b.id} href={`/bookings/${b.id}`} className={`ticket${faded ? " faded" : ""}`}>
        <div className="ticket-date"><small>{month}</small><b>{day}</b></div>
        <div style={{ minWidth: 0 }}>
          <strong className="display" style={{ fontSize: "1.15rem" }}>{b.packageName}</strong> · {formatPrice(b.priceCents, b.currency)}
          <div className="muted" style={{ fontSize: 14 }}>
            {formatInZone(b.startsAt, tz, { weekday: "short", month: undefined, day: undefined })} · {locations.get(b.locationId)?.name ?? "Location closed"}
          </div>
        </div>
        <span className="chip">{STATUS_LABEL[b.status]}</span>
      </Link>
    );
  };

  return (
    <>
      <p className="eyebrow">Your garage</p>
      <h1>Wash Passes</h1>
      <h2 style={{ marginTop: 24 }}>Coming up</h2>
      {upcoming.length ? (
        <div className="tickets">{upcoming.map((b) => ticket(b, false))}</div>
      ) : (
        <p className="muted">Nothing on the calendar. <Link href="/">Book a wash</Link></p>
      )}
      {past.length > 0 && (
        <>
          <h2 style={{ marginTop: 28 }}>Past &amp; cancelled</h2>
          <div className="tickets">{past.map((b) => ticket(b, true))}</div>
        </>
      )}
    </>
  );
}
