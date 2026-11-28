import { describe, expect, it } from "vitest";
import { crowdLevel, isQuietHour, quoteSlot } from "@/domain/pricing/quote";
import { checkInCode } from "@/domain/booking/checkInCode";

const NY = "America/New_York";

describe("Quiet Hours", () => {
  it("applies on weekday afternoons in the location's zone", () => {
    expect(isQuietHour(new Date("2026-06-10T17:00:00Z"), NY)).toBe(true); // Wed 13:00 EDT
    expect(isQuietHour(new Date("2026-06-10T19:45:00Z"), NY)).toBe(true); // Wed 15:45
    expect(isQuietHour(new Date("2026-06-10T20:00:00Z"), NY)).toBe(false); // Wed 16:00, window is half-open
    expect(isQuietHour(new Date("2026-06-10T16:45:00Z"), NY)).toBe(false); // Wed 12:45
    expect(isQuietHour(new Date("2026-06-13T17:00:00Z"), NY)).toBe(false); // Saturday
  });

  it("uses local time, not UTC: 13:00 in LA is 20:00 UTC", () => {
    expect(isQuietHour(new Date("2026-06-10T20:00:00Z"), "America/Los_Angeles")).toBe(true);
  });

  it("discounts by 20% and rounds to whole cents", () => {
    const q = quoteSlot({ basePriceCents: 2999, startsAt: new Date("2026-06-10T17:00:00Z"), timezone: NY, freeBays: 3, totalBays: 3 });
    expect(q).toEqual({ basePriceCents: 2999, priceCents: 2399, discount: { kind: "quietHours", percentOff: 20 }, crowd: "calm" });
  });

  it("charges full price outside the window", () => {
    const q = quoteSlot({ basePriceCents: 2900, startsAt: new Date("2026-06-13T17:00:00Z"), timezone: NY, freeBays: 1, totalBays: 3 });
    expect(q).toMatchObject({ priceCents: 2900, discount: null, crowd: "busy" });
  });
});

describe("crowdLevel", () => {
  it("buckets by share of free bays", () => {
    expect(crowdLevel(3, 3)).toBe("calm");
    expect(crowdLevel(2, 4)).toBe("steady");
    expect(crowdLevel(1, 3)).toBe("busy");
    expect(crowdLevel(0, 0)).toBe("busy");
  });
});

describe("checkInCode", () => {
  it("is stable, readable, and avoids ambiguous letters", () => {
    const id = "3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b";
    expect(checkInCode(id)).toBe(checkInCode(id));
    expect(checkInCode(id)).toMatch(/^SUDS-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}$/);
    expect(checkInCode(id)).not.toBe(checkInCode("3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7c"));
  });
  it("rejects non-UUIDs", () => {
    expect(() => checkInCode("nope")).toThrow();
  });
});
