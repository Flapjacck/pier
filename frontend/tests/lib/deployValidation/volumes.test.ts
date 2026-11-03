import { describe, expect, it } from "vitest";
import { validateDeployForm } from "../../../src/lib/deployValidation";

const base = { name: "web", image: "nginx:1.27", port: "80", replicas: "1", host: "", env: [], publicUrl: false };

describe("deploy volume validation", () => {
  it("puts mount errors under errors.volume", () => {
    const result = validateDeployForm({ ...base, volume: { name: "data", mountPath: "/proc/x", size: "1Gi" } }, { ingressDomain: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.volume?.mountPath).toBeTruthy();
  });
  it("rejects replicas above one with a volume", () => {
    const result = validateDeployForm({ ...base, replicas: "2", volume: { name: "data", mountPath: "/data", size: "1Gi" } }, { ingressDomain: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.replicas).toBeTruthy();
  });
});
