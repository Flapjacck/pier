import { describe, expect, it } from "vitest";
import { parseDeployDetail, parseDeployPage, parseDeployResponse, parseDeploySummary, parseRestartResult } from "../../src/api/deployGuards";
import { parseApp } from "../../src/api/guards";
import { detail, summary } from "../helpers/deploys";

const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe("deploy guards", () => {
  it("parses a summary, a detail, a page and a detail response", () => {
    const s = summary();
    expect(parseDeploySummary(json(s))).toEqual(s);
    const d = detail({}, "pull");
    expect(parseDeployDetail(json(d))).toEqual(d);
    expect(parseDeployResponse({ ok: true, deployment: json(d) }).steps).toHaveLength(7);
    const page = parseDeployPage({ ok: true, deployments: [json(summary({ id: 3 }))], nextBefore: 3 });
    expect(page.deployments[0]?.id).toBe(3);
    expect(page.nextBefore).toBe(3);
  });

  it("rejects missing or wrong required fields", () => {
    const bad = (over: Record<string, unknown>) => ({ ...summary(), ...over });
    expect(() => parseDeploySummary(bad({ status: "done" }))).toThrow(SyntaxError);
    expect(() => parseDeploySummary(bad({ trigger: "scale" }))).toThrow(SyntaxError);
    expect(() => parseDeploySummary(bad({ reason: 1 }))).toThrow(SyntaxError);
    expect(() => parseDeploySummary(bad({ currentStep: "nope" }))).toThrow(SyntaxError);
    expect(() => parseDeploySummary({ ...summary(), durationMs: undefined })).toThrow(SyntaxError);
    expect(() => parseDeployDetail(summary())).toThrow(SyntaxError);
    const d = detail();
    expect(() => parseDeployDetail({ ...d, steps: [{ ...d.steps[0], status: "ok" }] })).toThrow(SyntaxError);
    expect(() => parseDeployDetail({ ...d, steps: [{ ...d.steps[0], lines: [{ ts: "x", level: "debug", text: "" }] }] })).toThrow(SyntaxError);
    expect(() => parseDeployPage({ ok: true, deployments: [] })).toThrow(SyntaxError);
    expect(() => parseDeployResponse({ ok: false, deployment: d })).toThrow(SyntaxError);
  });

  it("keeps only display fields of the expected type in the spec", () => {
    const parsed = parseDeploySummary({ ...summary(), spec: { image: "a", port: "80", envKeys: ["A", 1], replicas: 2 } });
    expect(parsed.spec).toEqual({ image: "a", replicas: 2 });
    expect(parseDeploySummary({ ...summary(), spec: null }).spec).toEqual({});
  });

  it("keeps deploymentId on apps and restart results when it is a number", () => {
    const app = { name: "web", image: "nginx", replicas: 1, ready: 0, status: "building", createdAt: "2026-01-01T00:00:00Z" };
    expect(parseApp({ ...app, deploymentId: 7 }).deploymentId).toBe(7);
    expect(parseApp({ ...app, deploymentId: "7" }).deploymentId).toBeUndefined();
    expect(parseRestartResult({ ok: true, restartedAt: "t", deploymentId: 9 })).toEqual({ ok: true, restartedAt: "t", deploymentId: 9 });
    expect(parseRestartResult({ ok: true, restartedAt: "t" })).toEqual({ ok: true, restartedAt: "t" });
    expect(() => parseRestartResult({ ok: true })).toThrow(SyntaxError);
  });
});
