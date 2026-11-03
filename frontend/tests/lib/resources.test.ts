import { describe, it, expect } from "vitest";
import {
  DEFAULT_RESOURCES,
  getResourceField,
  parseCpu,
  parseMemory,
  presetIdFor,
  RESOURCE_PRESETS,
  setResourceField,
  validateResources,
} from "../../src/lib/resources";

describe("parseCpu / parseMemory", () => {
  it("parses millicores and cores", () => {
    expect(parseCpu("250m")).toBe(0.25);
    expect(parseCpu("1.5")).toBe(1.5);
    expect(parseCpu("2")).toBe(2);
  });

  it("parses Mi and Gi into MiB", () => {
    expect(parseMemory("256Mi")).toBe(256);
    expect(parseMemory("1Gi")).toBe(1024);
  });

  it("rejects formats the backend rejects", () => {
    expect(parseCpu("0.5m")).toBeUndefined();
    expect(parseCpu("lots")).toBeUndefined();
    expect(parseMemory("512M")).toBeUndefined();
    expect(parseMemory("1.5Gi")).toBeUndefined();
  });
});

describe("presets", () => {
  it("are all valid and map back to their id", () => {
    for (const preset of RESOURCE_PRESETS) {
      expect(validateResources(preset.values)).toEqual({});
      expect(presetIdFor(preset.values)).toBe(preset.id);
    }
  });

  it("treats anything else as custom", () => {
    expect(presetIdFor(setResourceField(DEFAULT_RESOURCES, "limits.memory", "300Mi"))).toBe("custom");
  });
});

describe("field helpers", () => {
  it("reads and writes one field without touching the rest", () => {
    const next = setResourceField(DEFAULT_RESOURCES, "requests.memory", "128Mi");
    expect(getResourceField(next, "requests.memory")).toBe("128Mi");
    expect(next.limits).toEqual(DEFAULT_RESOURCES.limits);
    expect(DEFAULT_RESOURCES.requests.memory).toBe("64Mi");
  });
});

describe("validateResources", () => {
  it("flags bad formats", () => {
    const errors = validateResources({
      requests: { cpu: "abc", memory: "64MB" },
      limits: { cpu: "500m", memory: "256Mi" },
    });
    expect(errors["requests.cpu"]).toMatch(/millicores/);
    expect(errors["requests.memory"]).toMatch(/Mi or Gi/);
  });

  it("flags limits below requests", () => {
    const errors = validateResources({
      requests: { cpu: "1", memory: "512Mi" },
      limits: { cpu: "500m", memory: "256Mi" },
    });
    expect(errors["limits.cpu"]).toMatch(/at least the CPU request/);
    expect(errors["limits.memory"]).toMatch(/at least the memory request/);
  });

  it("flags limits above the namespace max", () => {
    const errors = validateResources({
      requests: { cpu: "50m", memory: "64Mi" },
      limits: { cpu: "3", memory: "4Gi" },
    });
    expect(errors["limits.cpu"]).toMatch(/At most 2 cores/);
    expect(errors["limits.memory"]).toMatch(/At most 2Gi/);
  });
});
