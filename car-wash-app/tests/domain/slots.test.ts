import { describe, expect, it } from "vitest";
import { computeDayAvailability, type AvailabilityInput } from "@/domain/availability/slots";
import { BAY1, BAY2 } from "../support/fakes";

const base = (over: Partial<AvailabilityInput> = {}): AvailabilityInput => ({
  timezone: "America/New_York",
  localDate: "2026-06-10",
  hours: [{ dayOfWeek: 3, opensAt: "08:00", closesAt: "10:00" }], // Wednesday
  blackoutDates: [],
  slotIntervalMin: 15,
  durationMin: 30,
  minLeadTimeMin: 0,
  bayIds: [BAY1, BAY2],
  busy: new Map(),
  now: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

const open = (input: AvailabilityInput) => {
  const r = computeDayAvailability(input);
  if (r.kind !== "open") throw new Error(`expected open, got ${r.reason}`);
  return r.slots;
};

describe("computeDayAvailability", () => {
  it("generates slots that fit fully inside opening hours", () => {
    const slots = open(base());
    expect(slots.map((s) => s.localTime)).toEqual(["08:00", "08:15", "08:30", "08:45", "09:00", "09:15", "09:30"]);
    expect(slots[0]!.startsAt.toISOString()).toBe("2026-06-10T12:00:00.000Z");
  });

  it("is closed on days without hours and on blackout dates", () => {
    expect(computeDayAvailability(base({ localDate: "2026-06-11" }))).toEqual({ kind: "closed", reason: "Closed on this day" });
    expect(computeDayAvailability(base({ blackoutDates: [{ date: "2026-06-10", reason: "Maintenance" }] })))
      .toEqual({ kind: "closed", reason: "Maintenance" });
  });

  it("is closed when the location has no active bays", () => {
    expect(computeDayAvailability(base({ bayIds: [] })).kind).toBe("closed");
  });

  it("hides slots inside the minimum lead time", () => {
    const slots = open(base({ now: new Date("2026-06-10T12:20:00Z"), minLeadTimeMin: 30 })); // 08:20 local, earliest 08:50
    expect(slots[0]!.localTime).toBe("09:00");
  });

  it("counts free bays and drops slots where every bay overlaps a booking", () => {
    const busy = new Map([
      [BAY1, [{ start: new Date("2026-06-10T12:00:00Z"), end: new Date("2026-06-10T12:30:00Z") }]],
      [BAY2, [{ start: new Date("2026-06-10T12:00:00Z"), end: new Date("2026-06-10T12:45:00Z") }]],
    ]);
    const slots = open(base({ busy }));
    const at = (t: string) => slots.find((s) => s.localTime === t);
    expect(at("08:00")).toBeUndefined();
    expect(at("08:15")).toBeUndefined();
    expect(at("08:30")!.freeBayIds).toEqual([BAY1]); // back-to-back with the 08:00 booking is fine
    expect(at("08:45")!.freeBayIds).toEqual([BAY1, BAY2]);
  });

  it("spring-forward day: no slot is labelled with a nonexistent time", () => {
    const slots = open(base({
      localDate: "2026-03-08", // Sunday
      hours: [{ dayOfWeek: 0, opensAt: "01:00", closesAt: "04:00" }],
      durationMin: 15,
      slotIntervalMin: 30,
    }));
    // 01:00–04:00 local is only 2 real hours on this day.
    expect(slots.map((s) => s.localTime)).toEqual(["01:00", "01:30", "03:00", "03:30"]);
  });

  it("fall-back day: the repeated hour yields distinct instants with different zone labels", () => {
    const slots = open(base({
      localDate: "2026-11-01", // Sunday
      hours: [{ dayOfWeek: 0, opensAt: "00:30", closesAt: "02:00" }],
      durationMin: 15,
      slotIntervalMin: 30,
    }));
    expect(slots.map((s) => `${s.localTime} ${s.zoneAbbr}`)).toEqual([
      "00:30 EDT", "01:00 EDT", "01:30 EDT", "01:00 EST", "01:30 EST",
    ]);
    expect(new Set(slots.map((s) => s.startsAt.getTime())).size).toBe(slots.length);
  });

  it("works for half-hour-offset zones", () => {
    const slots = open(base({ timezone: "Asia/Kolkata", hours: [{ dayOfWeek: 3, opensAt: "09:00", closesAt: "10:00" }] }));
    expect(slots[0]!.startsAt.toISOString()).toBe("2026-06-10T03:30:00.000Z");
  });
});
