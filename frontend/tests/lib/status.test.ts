import { describe, it, expect } from "vitest";
import { getStatusClasses } from "../../src/lib/status";

describe("getStatusClasses", () => {
  it("returns running status classes", () => {
    const classes = getStatusClasses("running");
    expect(classes.label).toBe("running");
    expect(classes.text).toBe("text-pier-status-running");
    expect(classes.background).toBe("bg-pier-status-running-bg");
    expect(classes.icon).toBe("text-pier-status-running-icon");
  });

  it("returns building status classes", () => {
    const classes = getStatusClasses("building");
    expect(classes.label).toBe("building");
    expect(classes.text).toBe("text-pier-status-building");
    expect(classes.background).toBe("bg-pier-status-building-bg");
    expect(classes.icon).toBe("text-pier-status-building-icon");
  });

  it("returns failed status classes", () => {
    const classes = getStatusClasses("failed");
    expect(classes.label).toBe("failed");
    expect(classes.text).toBe("text-pier-status-failed");
    expect(classes.background).toBe("bg-pier-status-failed-bg");
    expect(classes.icon).toBe("text-pier-status-failed-icon");
  });

  it("returns stopped status classes", () => {
    const classes = getStatusClasses("stopped");
    expect(classes.label).toBe("stopped");
    expect(classes.text).toBe("text-pier-status-stopped");
    expect(classes.background).toBe("bg-pier-status-stopped-bg");
    expect(classes.icon).toBe("text-pier-status-stopped-icon");
  });
});
