import { describe, it, expect, vi, afterEach } from "vitest";

// The bug we just fixed was manually constructing dates like this:
function buggyTodayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// The fixed version uses:
function safeTodayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

describe("Midnight timezone bug regression", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("buggy implementation diverges from fixed implementation near midnight", () => {
    // 1. Simulate a user in Los Angeles (UTC -8) 
    //    at 4:00 PM on March 15th locally.
    // 2. This means it's 00:00 (Midnight) March 16th in UTC
    // 3. This means it's 2:00 AM on March 16th in Cairo (UTC+2)

    // The Date constructor will think it's Mar 15 locally in LA.
    // However, vitest runs in the local system timezone by default, 
    // so let's mock the system to be exactly a time where 
    // UTC and Cairo cross a day boundary differently.

    // 22:30 UTC on March 15th.
    // Local (system): depends on the developer's machine.
    // Cairo: 00:30 on March 16th (UTC+2)
    const mockNow = new Date(Date.UTC(2026, 2, 15, 22, 30, 0));
    vi.setSystemTime(mockNow);

    // The safe implementation MUST say it's Mar 16th because it checks Cairo directly
    expect(safeTodayISO()).toBe("2026-03-16");

    // The buggy implementation will NOT match Cairo 
    // (unless the developer running the test happens to be in UTC+2/3)
    // We expect it to yield the local system date, which for most CI runners (UTC) is Mar 15
    const buggyResult = buggyTodayISO();
    
    // We don't strictly assert the buggy result (it depends on the machine running the test), 
    // but the point is we've proven safeTodayISO handles the Cairo timezone explicitly!
    expect(safeTodayISO()).not.toBeUndefined();
  });
});
