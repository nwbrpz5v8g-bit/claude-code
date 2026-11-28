import Link from "next/link";
import { getAvailability } from "@/application/use-cases/getAvailability";
import { QUIET_HOURS } from "@/domain/pricing/quote";
import { container } from "@/server/container";
import { Bubbles } from "./_components/Brand";
import { formatInZone } from "./_lib/format";

export const dynamic = "force-dynamic";

type NextOpening = { label: string; quiet: boolean } | null;

/** "Next opening" per location, using the shortest package so the hint is never too optimistic. */
async function nextOpening(locationId: Parameters<typeof getAvailability>[1]["locationId"]): Promise<NextOpening> {
  const c = container();
  const packages = await c.catalog.listActivePackages();
  const shortest = [...packages].sort((a, b) => a.durationMin - b.durationMin)[0];
  if (!shortest) return null;
  const today = await getAvailability(c, { locationId, packageId: shortest.id });
  if (!today.ok) return null;
  const tz = today.value.location.timezone;
  const first = today.value.slots[0];
  if (first) return { label: `Today, ${formatInZone(first.startsAt, tz, { weekday: undefined, month: undefined, day: undefined })}`, quiet: first.discount !== null };
  const nextDate = today.value.nextAvailableDate;
  if (!nextDate) return null;
  const later = await getAvailability(c, { locationId, packageId: shortest.id, localDate: nextDate });
  const slot = later.ok ? later.value.slots[0] : undefined;
  return slot ? { label: formatInZone(slot.startsAt, tz, { month: undefined }), quiet: slot.discount !== null } : null;
}

export default async function HomePage() {
  const locations = await container().catalog.listActiveLocations();
  const openings = await Promise.all(locations.map((l) => nextOpening(l.id)));

  return (
    <>
      <section className="hero">
        <Bubbles />
        <p className="eyebrow">Car wash, sorted</p>
        <h1>Dirty car? <em>We've got suds.</em></h1>
        <p>Pick a bay, pick a time, roll in. No queue, no guessing. You can see how busy it'll be before you book.</p>
        <div className="hero-perks">
          <span className="chip chip-deal">−{QUIET_HOURS.percentOff}% Quiet Hours · weekdays {QUIET_HOURS.fromHour}:00–{QUIET_HOURS.toHour}:00</span>
          <span className="chip"><span className="dot calm" /> Live crowd forecast</span>
          <span className="chip">Free cancellation 24h+ ahead</span>
        </div>
      </section>

      {locations.length === 0 ? (
        <div className="panel empty">
          <div className="art" aria-hidden="true">🫧</div>
          <h2>No bays open for booking yet</h2>
          <p className="muted">We're still filling the buckets. Check back soon.</p>
        </div>
      ) : (
        <div className="locations">
          {locations.map((l, i) => {
            const next = openings[i];
            return (
              <article className="panel loc" key={l.id}>
                <div>
                  <p className="eyebrow" style={{ color: "var(--aqua-ink)" }}>{l.activeBayIds.length} bays · {l.timezone.split("/")[1]?.replace("_", " ")}</p>
                  <h2>{l.name}</h2>
                  <p className="muted" style={{ margin: "4px 0 0" }}>{l.address}</p>
                </div>
                <div className="loc-next">
                  {next ? (
                    <>
                      <span className="pulse" aria-hidden="true" />
                      <div>
                        <div className="muted" style={{ fontSize: 13 }}>Next opening</div>
                        <strong>{next.label}</strong>
                      </div>
                      {next.quiet && <span className="chip chip-deal" style={{ marginLeft: "auto" }}>−{QUIET_HOURS.percentOff}%</span>}
                    </>
                  ) : (
                    <span className="muted">Fully booked for the next two weeks</span>
                  )}
                </div>
                <Link className="btn btn-primary btn-lg" href={`/book/${l.id}`}>Book a bay →</Link>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
