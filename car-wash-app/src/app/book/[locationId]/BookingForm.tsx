"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, dayOfWeek } from "@/domain/availability/localTime";
import { api, type ApiResult } from "../../_lib/apiClient";
import { formatInZone, formatPrice } from "../../_lib/format";
import { Foam } from "../../_components/Brand";

type Pkg = { id: string; name: string; description: string; durationMin: number; priceCents: number; currency: string };
type Crowd = "calm" | "steady" | "busy";
type SlotDto = {
  startsAt: string;
  endsAt: string;
  localTime: string;
  zoneAbbr: string;
  freeBays: number;
  priceCents: number;
  basePriceCents: number;
  discount: { kind: "quietHours"; percentOff: number } | null;
  crowd: Crowd;
};
type AvailabilityDto = { localDate: string; closedReason: string | null; slots: SlotDto[]; nextAvailableDate: string | null };
type BookingCreated = { bookingId: string; checkoutUrl: string | null; status: string };

type Props = {
  location: { id: string; timezone: string; openDays: number[]; blackouts: string[] };
  packages: Pkg[];
  minDate: string;
  maxDate: string;
  signedIn: boolean;
  /** Draft carried in the URL so it survives the sign-in round trip and refreshes. */
  initial: { packageId?: string; date?: string; slot?: string };
};

type SlotsState =
  | { kind: "loading" }
  | { kind: "loaded"; data: AvailabilityDto }
  | { kind: "error"; message: string };

const STRIP_DAYS = 14;
const CROWD_LABEL: Record<Crowd, string> = { calm: "Calm", steady: "Steady", busy: "Busy" };
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function BookingForm({ location, packages, minDate, maxDate, signedIn, initial }: Props) {
  const router = useRouter();
  const [packageId, setPackageId] = useState(
    packages.some((p) => p.id === initial.packageId) ? initial.packageId! : (packages[0]?.id ?? ""),
  );
  const [date, setDate] = useState(initial.date && initial.date >= minDate && initial.date <= maxDate ? initial.date : minDate);
  const [slots, setSlots] = useState<SlotsState>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(initial.slot ?? null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // One key per checkout attempt: retries and double-clicks reuse it, a new choice gets a new one.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const pkg = useMemo(() => packages.find((p) => p.id === packageId), [packages, packageId]);
  const byPrice = useMemo(() => [...packages].sort((a, b) => a.priceCents - b.priceCents).map((p) => p.id), [packages]);
  const slot = slots.kind === "loaded" ? slots.data.slots.find((s) => s.startsAt === selected) : undefined;

  const days = useMemo(() => {
    const out: { date: string; closed: boolean }[] = [];
    for (let i = 0; i < STRIP_DAYS; i++) {
      const d = addDays(minDate, i);
      if (d > maxDate) break;
      out.push({ date: d, closed: !location.openDays.includes(dayOfWeek(d)) || location.blackouts.includes(d) });
    }
    return out;
  }, [minDate, maxDate, location.openDays, location.blackouts]);

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

  const pickDate = (d: string) => {
    setDate(d);
    setSelected(null);
  };

  async function submit() {
    if (!pkg || !slot) return;
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
        startsAt: slot.startsAt,
        expectedPriceCents: slot.priceCents,
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
      void loadSlots(); // the slot or its price moved; show the fresh picture
    }
  }

  return (
    <>
      <section className="panel">
        <div className="step"><span className="step-num">01</span><h2>How clean are we talking?</h2></div>
        <div className="packages">
          {packages.map((p) => (
            <button
              key={p.id}
              className="pkg"
              aria-pressed={p.id === packageId}
              onClick={() => { setPackageId(p.id); setSelected(null); }}
            >
              <Foam level={byPrice.indexOf(p.id) + 1} />
              <span className="pkg-name">{p.name}</span>
              <span className="muted" style={{ fontSize: 14 }}>{p.description}</span>
              <span className="row" style={{ justifyContent: "space-between", marginTop: "auto" }}>
                <span className="pkg-price">{formatPrice(p.priceCents, p.currency)}</span>
                <span className="chip">{p.durationMin} min</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="step"><span className="step-num">02</span><h2>When are you rolling in?</h2></div>
        <div className="days" role="group" aria-label="Choose a day">
          {days.map((d) => {
            const [, , dd] = d.date.split("-");
            return (
              <button
                key={d.date}
                className={`day${d.closed ? " closed" : ""}`}
                aria-pressed={d.date === date}
                aria-label={`${d.date}${d.closed ? " (closed)" : ""}`}
                onClick={() => pickDate(d.date)}
              >
                <small>{d.date === minDate ? "Today" : WEEKDAY[dayOfWeek(d.date)]}</small>
                <b>{Number(dd)}</b>
              </button>
            );
          })}
        </div>
        <details style={{ margin: "4px 0 8px" }}>
          <summary className="muted" style={{ cursor: "pointer", fontSize: 14 }}>Further ahead?</summary>
          <input
            type="date"
            aria-label="Pick any date"
            min={minDate}
            max={maxDate}
            value={date}
            onChange={(e) => e.target.value && pickDate(e.target.value)}
            style={{ maxWidth: 220, marginTop: 8 }}
          />
        </details>
        <div className="legend">
          <span><i className="dot calm" /> Calm: walk right in</span>
          <span><i className="dot steady" /> Steady</span>
          <span><i className="dot busy" /> Busy: last bays</span>
          <span><span className="chip chip-deal" style={{ padding: "3px 6px" }}>−20%</span> Quiet Hours deal</span>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>Times are local to the wash ({location.timezone.replace("_", " ")}).</p>
        <Timeline state={slots} selected={selected} onSelect={setSelected} onJump={pickDate} onRetry={loadSlots} />
      </section>

      {submitError && <p className="notice error" role="alert">{submitError}</p>}

      <div className="bar" role="region" aria-label="Booking summary">
        <div className="bar-inner">
          <div className="bar-summary">
            {pkg && slot ? (
              <>
                <div className="what">{pkg.name} · {formatInZone(slot.startsAt, location.timezone)}</div>
                <div>
                  <span className="price-big">{formatPrice(slot.priceCents, pkg.currency)}</span>
                  {slot.discount && <span className="strike">{formatPrice(slot.basePriceCents, pkg.currency)}</span>}
                  {slot.discount && <span className="chip chip-deal" style={{ marginLeft: 8 }}>Quiet Hours</span>}
                </div>
              </>
            ) : (
              <div className="muted">Pick a time to see your price</div>
            )}
          </div>
          <button className="btn btn-primary btn-lg" disabled={!slot || submitting} onClick={submit}>
            {submitting ? "Grabbing your bay…" : signedIn ? "Reserve & pay" : "Sign in to book"}
          </button>
        </div>
      </div>
    </>
  );
}

const PERIODS: { name: string; icon: string; from: number; to: number }[] = [
  { name: "Morning", icon: "🌅", from: 0, to: 12 },
  { name: "Afternoon", icon: "☀️", from: 12, to: 17 },
  { name: "Evening", icon: "🌙", from: 17, to: 24 },
];

function Timeline({
  state, selected, onSelect, onJump, onRetry,
}: {
  state: SlotsState;
  selected: string | null;
  onSelect: (iso: string) => void;
  onJump: (date: string) => void;
  onRetry: () => void;
}) {
  if (state.kind === "loading") {
    return (
      <div className="slots" style={{ marginTop: 16 }} aria-busy="true" aria-label="Loading times">
        {Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton" />)}
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="notice error" role="alert">
        {state.message} <button className="btn btn-sm" onClick={onRetry}>Try again</button>
      </div>
    );
  }
  const { data } = state;
  if (data.slots.length === 0) {
    return (
      <div className="empty">
        <div className="art" aria-hidden="true">{data.closedReason ? "🔒" : "🚗💨"}</div>
        <h3 className="display" style={{ fontSize: "1.3rem" }}>{data.closedReason ?? "Every bay is taken"}</h3>
        {data.nextAvailableDate ? (
          <button className="btn btn-aqua" onClick={() => onJump(data.nextAvailableDate!)}>
            Jump to next opening: {data.nextAvailableDate}
          </button>
        ) : (
          <p className="muted">No openings in the next two weeks. Try another location.</p>
        )}
      </div>
    );
  }
  // Repeated wall times happen on DST fall-back days; show the zone to disambiguate.
  const repeats = new Map<string, number>();
  data.slots.forEach((s) => repeats.set(s.localTime, (repeats.get(s.localTime) ?? 0) + 1));

  return (
    <>
      {PERIODS.map((p) => {
        const items = data.slots.filter((s) => {
          const h = Number(s.localTime.slice(0, 2));
          return h >= p.from && h < p.to;
        });
        if (items.length === 0) return null;
        return (
          <div className="period" key={p.name}>
            <h3><span aria-hidden="true">{p.icon}</span> {p.name}</h3>
            <div className="slots">
              {items.map((s) => (
                <button
                  key={s.startsAt}
                  className="slot"
                  aria-pressed={s.startsAt === selected}
                  aria-label={`${s.localTime}, ${CROWD_LABEL[s.crowd]}${s.discount ? `, ${s.discount.percentOff}% off` : ""}`}
                  onClick={() => onSelect(s.startsAt)}
                >
                  {s.discount && <span className="deal">−{s.discount.percentOff}%</span>}
                  <span>
                    {s.localTime}
                    {(repeats.get(s.localTime) ?? 0) > 1 && <small> {s.zoneAbbr}</small>}
                  </span>
                  <span className="meta"><i className={`dot ${s.crowd}`} />{CROWD_LABEL[s.crowd]}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function describe(res: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (res.status === 429) return `Whoa, easy on the throttle. Try again in ${res.retryAfterSec ?? 60}s.`;
  return res.error.message;
}
