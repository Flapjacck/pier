import { describe, expect, it } from "vitest";
import { deployRedirectPath, deployStartedText, deployStatusTone, formatDuration, triggerLabel } from "../../src/lib/deploys";

describe("deploy helpers", () => {
  it("formats durations", () => {
    expect(formatDuration(400)).toBe("0.4s");
    expect(formatDuration(1200)).toBe("1.2s");
    expect(formatDuration(65_000)).toBe("1m 05s");
    expect(formatDuration(3_720_000)).toBe("1h 02m");
  });

  it("labels triggers and maps statuses to tones", () => {
    expect(triggerLabel("patch")).toBe("Settings change");
    expect(deployStatusTone("running")).toBe("building");
    expect(deployStatusTone("succeeded")).toBe("running");
  });

  it("builds toast text and the redirect path", () => {
    expect(deployStartedText(5, "Updated web")).toBe("Deploy #5 started");
    expect(deployStartedText(undefined, "Updated web")).toBe("Updated web");
    expect(deployRedirectPath({ name: "web", deploymentId: 3 })).toBe("/apps/web/deployments/3");
    expect(deployRedirectPath({ name: "web" })).toBe("/apps/web");
  });
});
