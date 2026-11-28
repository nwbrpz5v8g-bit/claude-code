import { notFound } from "next/navigation";
import { z } from "zod";
import { asId } from "@/domain/shared/ids";
import { addDays, localDateOf } from "@/domain/availability/localTime";
import { MAX_DAYS_AHEAD } from "@/application/use-cases/getAvailability";
import { container } from "@/server/container";
import { currentActor } from "@/server/auth/session";
import { Bubbles } from "../../_components/Brand";
import { BookingForm } from "./BookingForm";

export const dynamic = "force-dynamic";

const draft = z.object({
  package: z.string().uuid().optional().catch(undefined),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  slot: z.string().datetime({ offset: true }).optional().catch(undefined),
});

export default async function BookPage({
  params, searchParams,
}: {
  params: Promise<{ locationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locationId }, sp] = await Promise.all([params, searchParams]);
  // Malformed draft values are dropped, never an error: the URL is user-editable.
  const initial = draft.parse({ package: sp.package, date: sp.date, slot: sp.slot });
  if (!z.string().uuid().safeParse(locationId).success) notFound();
  const c = container();
  const [location, packages, actor] = await Promise.all([
    c.catalog.getLocation(asId(locationId)),
    c.catalog.listActivePackages(),
    currentActor(),
  ]);
  if (!location || !location.isActive) notFound();

  const today = localDateOf(c.clock.now(), location.timezone);
  return (
    <>
      <section className="hero" style={{ paddingBottom: 8 }}>
        <Bubbles count={8} />
        <p className="eyebrow">Book a bay</p>
        <h1>{location.name}</h1>
        <p style={{ margin: 0 }}>{location.address}</p>
      </section>
      {packages.length === 0 ? (
        <div className="panel empty">
          <div className="art" aria-hidden="true">🧽</div>
          <h2>No wash packages available right now</h2>
          <p className="muted">Please check back later.</p>
        </div>
      ) : (
        <BookingForm
          location={{
            id: location.id,
            timezone: location.timezone,
            openDays: location.hours.map((h) => h.dayOfWeek),
            blackouts: location.blackoutDates.map((b) => b.date),
          }}
          packages={packages.map((p) => ({
            id: p.id, name: p.name, description: p.description, durationMin: p.durationMin, priceCents: p.priceCents, currency: p.currency,
          }))}
          minDate={today}
          maxDate={addDays(today, MAX_DAYS_AHEAD)}
          signedIn={actor.kind === "user"}
          initial={{ packageId: initial.package, date: initial.date, slot: initial.slot }}
        />
      )}
    </>
  );
}
