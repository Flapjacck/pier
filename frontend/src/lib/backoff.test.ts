import { describe, it, expect } from "vitest";
import { backoffDelay } from "./backoff";

describe("backoffDelay", () => {
  it("attempt 0 gives 1000ms at mid-random", () => {
    const delay = backoffDelay(0, () => 0.5);
    expect(delay).toBe(1000); // 1000 + 0 jitter (0.5 is mid-point)
  });

  it("doubles on each attempt", () => {
    const d0 = backoffDelay(0, () => 0.5);
    const d1 = backoffDelay(1, () => 0.5);
    const d2 = backoffDelay(2, () => 0.5);
    const d3 = backoffDelay(3, () => 0.5);

    expect(d0).toBe(1000);
    expect(d1).toBe(2000);
    expect(d2).toBe(4000);
    expect(d3).toBe(8000);
  });

  it("caps at 30000ms", () => {
    const d = backoffDelay(20, () => 0.5); // Would be 1000 * 2^20
    expect(d).toBe(30000);
  });

  it("applies jitter: ±20% of base", () => {
    const d0 = backoffDelay(0, () => 0); // Min jitter
    const d1 = backoffDelay(0, () => 1); // Max jitter

    // At random=0: jitter = 1000 * 0.2 * (0 - 0.5) = -100
    expect(d0).toBe(900);

    // At random=1: jitter = 1000 * 0.2 * (1 - 0.5) = 100
    expect(d1).toBe(1100);
  });

  it("jitter on 4s base (attempt 2)", () => {
    const d0 = backoffDelay(2, () => 0);
    const d1 = backoffDelay(2, () => 1);

    // At random=0: jitter = 4000 * 0.2 * (0 - 0.5) = -400
    expect(d0).toBe(3600);

    // At random=1: jitter = 4000 * 0.2 * (1 - 0.5) = 400
    expect(d1).toBe(4400);
  });

  it("uses Math.random by default", () => {
    const d = backoffDelay(0);
    // Just verify it's in the expected range for attempt 0: [800, 1200]
    expect(d).toBeGreaterThanOrEqual(800);
    expect(d).toBeLessThanOrEqual(1200);
  });

  it("applies jitter at cap (30s)", () => {
    const d0 = backoffDelay(10, () => 0);
    const d1 = backoffDelay(10, () => 1);

    // At random=0: jitter = 30000 * 0.2 * (0 - 0.5) = -3000
    expect(d0).toBe(27000);

    // At random=1: jitter = 30000 * 0.2 * (1 - 0.5) = 3000
    expect(d1).toBe(33000);
  });
});
