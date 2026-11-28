"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type ApiResult } from "../../_lib/apiClient";
import { formatInZone, formatPrice } from "../../_lib/format";

type Pkg = { id: string; name: string; description: string; durationMin: number; priceCents: number; currency: string };
type SlotDto = { startsAt: string; endsAt: string; localTime: string; zoneAbbr: string; freeBays: number };
type AvailabilityDto = { localDate: string; closedReason: string | null; slots: SlotDto[]; nextAvailableDate: string | null };
type BookingCreated = { bookingId: string; checkoutUrl: string | null; status: string };

type Props = {
  location: { id: string; timezone: string };
  /** Draft carried in the URL so it survives the sign-in round trip and refreshes. */
  initial: { packageId?: string; date?: string; slot?: string };
  packages: Pkg[];
  minDate: string;
  maxDate: string;
  signedIn: boolean;
};

type SlotsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; data: AvailabilityDto }
  | { kind: "error"; message: string };

export function BookingForm({ location, packages, minDate, maxDate, signedIn, initial }: Props) {
  const router = useRouter();
  const [packageId, setPackageId] = useState(
    packages.some((p) => p.id === initial.packageId) ? initial.packageId! : (packages[0]?.id ?? ""),
  );
  const [date, setDate] = useState(initial.date && initial.date >= minDate && initial.date <= maxDate ? initial.date : minDate);
  const [slots, setSlots] = useState<SlotsState>({ kind: "idle" });
  const [selected, setSelected] = useState<string | null>(initial.slot ?? null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // One key per checkout attempt: retries and double-clicks reuse it, a new choice gets a new one.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const pkg = useMemo(() => packages.find((p) => p.id === packageId), [packages, packageId]);

  const loadSlots = useCallback(async () => {
    if (!packageId) return;
    setSlots({ kind: "loading" });
    const qs = new URLSearchParams({ locationId: location.id, packageId, date });
    const res = await api<AvailabilityDto>(`/api/v1/availability?${qs}`);
    if (res.ok) {
      setSlots({ kind: "loaded", data: res.data });
      // Keep a previously chosen slot only if it is still offered.
      setSelected((cur) => (cur && res.data.slots.some((s) => s.startsAt === cur) ? cur : null));
    } else {
      setSlots({ kind: "error", message: describe(res) });
    }
  }, [location.id, packageId, date]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  useEffect(() => setIdempotencyKey(crypto.randomUUID()), [packageId, date, selected]);

  // Mirror the draft into the URL (without navigation) so reloads and sign-in keep it.
  const draftPath = useMemo(() => {
    const qs = new URLSearchParams({ package: packageId, date });
    if (selected) qs.set("slot", selected);
    return `/book/${location.id}?${qs}`;
  }, [location.id, packageId, date, selected]);
  useEffect(() => window.history.replaceState(null, "", draftPath), [draftPath]);

  async function submit() {
    if (!pkg || !selected) return;
    if (!signedIn) {
      router.push(`/login?returnTo=${encodeURIComponent(draftPath)}`);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const res = await api<BookingCreated>("/api/v1/bookings", {
      method: "POST",
      body: JSON.stringify({
        locationId: location.id,
        packageId,
        startsAt: selected,
        expectedPriceCents: pkg.priceCents,
        idempotencyKey,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      if (res.data.checkoutUrl) window.location.assign(res.data.checkoutUrl);
      else router.push(`/bookings/${res.data.bookingId}`);
      return;
    }
    // Keep the key only when we cannot know whether the server acted (network loss, 5xx),
    // so a retry is deduplicated. Any definitive answer means the next attempt is a new one.
    if (res.status !== 0 && res.status < 500) setIdempotencyKey(crypto.randomUUID());
    if (res.status === 401) {
      router.push(`/login?returnTo=${encodeURIComponent(draftPath)}`);
      return;
    }
    setSubmitError(describe(res));
    if (res.error.kind === "SlotUnavailable" || res.error.kind === "LocationClosed" || res.error.kind === "Validation") {
      router.refresh(); // prices may have changed
      void loadSlots();
    }
  }

  return (
    <>
      <section className="card">
        <h2>1. Choose a package</h2>
        <div className="row">
          {packages.map((p) => (
            <button key={p.id} aria-pressed={p.id === packageId} onClick={() => { setPackageId(p.id); setSelected(null); }} style={{ textAlign: "left" }}>
              <strong>{p.name}</strong> · {formatPrice(p.priceCents, p.currency)}
              <div className="muted" style={{ fontSize: 14 }}>{p.description} · {p.durationMin} min</div>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>2. Pick a time</h2>
        <div className="row">
          <label htmlFor="date" className="muted">Date</label>
          <input id="date" type="date" min={minDate} max={maxDate} value={date} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setSelected(null); } }} />
          <span className="muted" style={{ fontSize: 14 }}>Times are local to the location ({location.timezone.replace("_", " ")})</span>
        </div>
        <SlotPicker state={slots} selected={selected} onSelect={setSelected} onJump={(d) => { setDate(d); setSelected(null); }} onRetry={loadSlots} />
      </section>

      <section className="card">
        <h2>3. Confirm and pay</h2>
        {pkg && selected ? (
          <p>{pkg.name} on <strong>{formatInZone(selected, location.timezone)}</strong> · {formatPrice(pkg.priceCents, pkg.currency)}</p>
        ) : (
          <p className="muted">Choose a package and a time to continue.</p>
        )}
        <button className="primary" disabled={!selected || submitting} onClick={submit}>
          {submitting ? "Reserving…" : signedIn ? "Reserve and pay" : "Sign in to book"}
        </button>
        <p className="muted" style={{ fontSize: 14 }}>Your slot is held for 10 minutes while you pay.</p>
        {submitError && <p className="notice error" role="alert">{submitError}</p>}
      </section>
    </>
  );
}

function SlotPicker({
  state, selected, onSelect, onJump, onRetry,
}: {
  state: SlotsState;
  selected: string | null;
  onSelect: (iso: string) => void;
  onJump: (date: string) => void;
  onRetry: () => void;
}) {
  if (state.kind === "idle" || state.kind === "loading") return <p className="muted">Loading available times…</p>;
  if (state.kind === "error") {
    return (
      <div className="notice error" role="alert">
        {state.message} <button onClick={onRetry}>Retry</button>
      </div>
    );
  }
  const { data } = state;
  if (data.slots.length === 0) {
    return (
      <div className="empty">
        <p><strong>{data.closedReason ?? "Fully booked on this day"}</strong></p>
        {data.nextAvailableDate ? (
          <button onClick={() => onJump(data.nextAvailableDate!)}>Next available: {data.nextAvailableDate}</button>
        ) : (
          <p className="muted">No openings in the next two weeks. Try another location.</p>
        )}
      </div>
    );
  }
  // Repeated wall times happen on DST fall-back days; show the zone to disambiguate.
  const seen = new Map<string, number>();
  data.slots.forEach((s) => seen.set(s.localTime, (seen.get(s.localTime) ?? 0) + 1));
  return (
    <div className="grid" style={{ marginTop: 12 }}>
      {data.slots.map((s) => (
        <button key={s.startsAt} aria-pressed={s.startsAt === selected} onClick={() => onSelect(s.startsAt)}>
          {s.localTime}
          {(seen.get(s.localTime) ?? 0) > 1 && <span className="muted"> {s.zoneAbbr}</span>}
        </button>
      ))}
    </div>
  );
}

function describe(res: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (res.status === 429) return `You're going a bit fast. Try again in ${res.retryAfterSec ?? 60} seconds.`;
  return res.error.message;
}
