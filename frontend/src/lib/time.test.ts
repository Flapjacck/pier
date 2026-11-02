import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { formatRelativeTime, formatAbsoluteDate } from "./time";

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'now' for times within the last minute", () => {
    const time = new Date("2024-01-01T11:59:45Z").toISOString();
    expect(formatRelativeTime(time)).toBe("now");
  });

  it("returns minutes ago", () => {
    const time = new Date("2024-01-01T11:50:00Z").toISOString();
    expect(formatRelativeTime(time)).toBe("10 minutes ago");
  });

  it("returns singular minute", () => {
    const time = new Date("2024-01-01T11:59:00Z").toISOString();
    expect(formatRelativeTime(time)).toBe("1 minute ago");
  });

  it("returns hours ago", () => {
    const time = new Date("2024-01-01T10:00:00Z").toISOString();
    expect(formatRelativeTime(time)).toBe("2 hours ago");
  });

  it("returns singular hour", () => {
    const time = new Date("2024-01-01T11:00:00Z").toISOString();
    expect(formatRelativeTime(time)).toBe("1 hour ago");
  });

  it("returns days ago", () => {
    const time = new Date("2023-12-30T12:00:00Z").toISOString();
    expect(formatRelativeTime(time)).toBe("2 days ago");
  });

  it("returns singular day", () => {
    const time = new Date("2023-12-31T12:00:00Z").toISOString();
    expect(formatRelativeTime(time)).toBe("1 day ago");
  });

  it("handles future dates: in a moment", () => {
    const time = new Date("2024-01-01T12:00:30Z").toISOString();
    expect(formatRelativeTime(time)).toBe("in a moment");
  });

  it("handles future: in minutes", () => {
    const time = new Date("2024-01-01T12:10:00Z").toISOString();
    expect(formatRelativeTime(time)).toBe("in 10 minutes");
  });

  it("handles future: in singular minute", () => {
    const time = new Date("2024-01-01T12:01:00Z").toISOString();
    expect(formatRelativeTime(time)).toBe("in 1 minute");
  });

  it("handles future: in hours", () => {
    const time = new Date("2024-01-01T14:00:00Z").toISOString();
    expect(formatRelativeTime(time)).toBe("in 2 hours");
  });

  it("handles future: in singular hour", () => {
    const time = new Date("2024-01-01T13:00:00Z").toISOString();
    expect(formatRelativeTime(time)).toBe("in 1 hour");
  });

  it("handles future: in days", () => {
    const time = new Date("2024-01-03T12:00:00Z").toISOString();
    expect(formatRelativeTime(time)).toBe("in 2 days");
  });

  it("returns 'unknown' for invalid dates", () => {
    expect(formatRelativeTime("not a date")).toBe("unknown");
  });
});

describe("formatAbsoluteDate", () => {
  it("returns ISO string for valid date", () => {
    const result = formatAbsoluteDate("2024-01-01T12:00:00Z");
    expect(result).toBe("2024-01-01T12:00:00.000Z");
  });

  it("returns input on parsing error", () => {
    const input = "invalid";
    expect(formatAbsoluteDate(input)).toBe(input);
  });
});
