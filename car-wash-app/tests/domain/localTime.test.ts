import { describe, expect, it } from "vitest";
import { addDays, dayOfWeek, isValidLocalDate, localDateOf, wallTimeToUtc } from "@/domain/availability/localTime";

describe("local time helpers", () => {
  it("validates real calendar dates only", () => {
    expect(isValidLocalDate("2026-02-28")).toBe(true);
    expect(isValidLocalDate("2026-02-29")).toBe(false);
    expect(isValidLocalDate("2028-02-29")).toBe(true);
    expect(isValidLocalDate("2026-13-01")).toBe(false);
    expect(isValidLocalDate("26-1-1")).toBe(false);
  });

  it("computes day of week from the calendar date, independent of server zone", () => {
    expect(dayOfWeek("2026-11-28")).toBe(6); // Saturday
    expect(dayOfWeek("2026-11-29")).toBe(0);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("derives today's date in the location's zone, not UTC", () => {
    const lateEveningInLA = new Date("2026-06-11T05:30:00Z"); // 22:30 on the 10th in LA
    expect(localDateOf(lateEveningInLA, "America/Los_Angeles")).toBe("2026-06-10");
    expect(localDateOf(lateEveningInLA, "Europe/London")).toBe("2026-06-11");
  });

  it("resolves ordinary wall times", () => {
    expect(wallTimeToUtc("2026-06-10", "08:00", "America/New_York").toISOString()).toBe("2026-06-10T12:00:00.000Z");
  });

  it("resolves a nonexistent spring-forward time to the first instant after the gap", () => {
    // 2026-03-08 02:00 EST → 03:00 EDT in New York; 02:30 does not exist.
    expect(wallTimeToUtc("2026-03-08", "02:30", "America/New_York").toISOString()).toBe("2026-03-08T07:00:00.000Z");
  });

  it("resolves an ambiguous fall-back time to the earlier instant", () => {
    // 2026-11-01 01:30 happens twice in New York (EDT then EST).
    expect(wallTimeToUtc("2026-11-01", "01:30", "America/New_York").toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
});
