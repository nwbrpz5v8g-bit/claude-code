import Link from "next/link";
import { redirect } from "next/navigation";
import { ACTIVE_STATUSES } from "@/domain/booking/booking";
import { listMyBookings } from "@/application/use-cases/queries";
import { container } from "@/server/container";
import { currentActor } from "@/server/auth/session";
import { formatInZone, formatPrice, STATUS_LABEL } from "../_lib/format";

export const dynamic = "force-dynamic";

export default async function MyBookingsPage() {
  const actor = await currentActor();
  const c = container();
  const result = await listMyBookings(c, actor);
  if (!result.ok) redirect("/login?returnTo=/bookings");

  const locations = new Map((await c.catalog.listActiveLocations()).map((l) => [l.id, l]));
  const now = c.clock.now().getTime();
  const isUpcoming = (b: (typeof result.value)[number]) => ACTIVE_STATUSES.has(b.status) && b.endsAt.getTime() >= now;
  const upcoming = result.value.filter(isUpcoming).reverse(); // soonest first
  const past = result.value.filter((b) => !isUpcoming(b));

  if (result.value.length === 0) {
    return (
      <div className="card empty">
        <h1>No bookings yet</h1>
        <p className="muted">Your upcoming washes will show up here.</p>
        <Link className="button primary" href="/">Book your first wash</Link>
      </div>
    );
  }

  const list = (items: typeof result.value) =>
    items.map((b) => {
      const tz = locations.get(b.locationId)?.timezone ?? "UTC";
      return (
        <Link key={b.id} href={`/bookings/${b.id}`} className="card row" style={{ justifyContent: "space-between", textDecoration: "none", color: "inherit" }}>
          <div>
            <strong>{b.packageName}</strong> · {formatPrice(b.priceCents, b.currency)}
            <div className="muted">{locations.get(b.locationId)?.name ?? "Location closed"} · {formatInZone(b.startsAt, tz)}</div>
          </div>
          <span className="badge">{STATUS_LABEL[b.status]}</span>
        </Link>
      );
    });

  return (
    <>
      <h1>My bookings</h1>
      <h2>Upcoming</h2>
      {upcoming.length ? list(upcoming) : <p className="muted">Nothing scheduled. <Link href="/">Book a wash</Link></p>}
      {past.length > 0 && (<><h2>Past &amp; cancelled</h2>{list(past)}</>)}
    </>
  );
}
