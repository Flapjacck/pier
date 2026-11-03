/**
 * CPU/RAM presets and validation for the deploy form and the Settings tab.
 * Mirrors backend/src/k8s/resources.ts and the quantity patterns in apps-schemas.ts.
 * The backend also checks the namespace's real LimitRange and ResourceQuota.
 */
import type { AppResources } from "../api/types";

export type ResourceField = "requests.cpu" | "requests.memory" | "limits.cpu" | "limits.memory";
export type ResourceErrors = Partial<Record<ResourceField, string>>;
export type PresetId = "small" | "default" | "medium" | "large" | "custom";

export type ResourcePreset = { id: Exclude<PresetId, "custom">; label: string; values: AppResources };

/** Same values the backend uses when no resources are sent. */
export const DEFAULT_RESOURCES: AppResources = {
  requests: { cpu: "50m", memory: "64Mi" },
  limits: { cpu: "500m", memory: "256Mi" },
};

export const RESOURCE_PRESETS: readonly ResourcePreset[] = [
  {
    id: "small",
    label: "Small",
    values: { requests: { cpu: "25m", memory: "32Mi" }, limits: { cpu: "250m", memory: "128Mi" } },
  },
  { id: "default", label: "Default", values: DEFAULT_RESOURCES },
  {
    id: "medium",
    label: "Medium",
    values: { requests: { cpu: "100m", memory: "128Mi" }, limits: { cpu: "1", memory: "512Mi" } },
  },
  {
    id: "large",
    label: "Large",
    values: { requests: { cpu: "250m", memory: "256Mi" }, limits: { cpu: "2", memory: "1Gi" } },
  },
];

/** Per-container max in Pier's shipped LimitRange (backend/k8s/quota.yaml). */
export const MAX_CPU_CORES = 2;
export const MAX_MEMORY_MI = 2048;

const CPU_PATTERN = /^(?:[1-9][0-9]{0,3}m|[0-9]{1,2}(?:\.[0-9]{1,3})?)$/;
const MEMORY_PATTERN = /^[1-9][0-9]{0,5}(?:Mi|Gi)$/;

/** "250m" → 0.25, "1.5" → 1.5 (cores). Undefined when it doesn't match the backend pattern. */
export function parseCpu(value: string): number | undefined {
  const v = value.trim();
  if (!CPU_PATTERN.test(v)) return undefined;
  return v.endsWith("m") ? Number(v.slice(0, -1)) / 1000 : Number(v);
}

/** "256Mi" → 256, "1Gi" → 1024 (MiB). Undefined when it doesn't match the backend pattern. */
export function parseMemory(value: string): number | undefined {
  const v = value.trim();
  if (!MEMORY_PATTERN.test(v)) return undefined;
  const n = Number(v.slice(0, -2));
  return v.endsWith("Gi") ? n * 1024 : n;
}

export function sameResources(a: AppResources, b: AppResources): boolean {
  return (
    a.requests.cpu === b.requests.cpu &&
    a.requests.memory === b.requests.memory &&
    a.limits.cpu === b.limits.cpu &&
    a.limits.memory === b.limits.memory
  );
}

/** Which preset these values are, or "custom". */
export function presetIdFor(res: AppResources): PresetId {
  return RESOURCE_PRESETS.find((p) => sameResources(p.values, res))?.id ?? "custom";
}

function splitField(field: ResourceField): ["requests" | "limits", "cpu" | "memory"] {
  const [side, kind] = field.split(".");
  return [side === "limits" ? "limits" : "requests", kind === "memory" ? "memory" : "cpu"];
}

export function getResourceField(res: AppResources, field: ResourceField): string {
  const [side, kind] = splitField(field);
  return res[side][kind];
}

export function setResourceField(res: AppResources, field: ResourceField, value: string): AppResources {
  const [side, kind] = splitField(field);
  return { ...res, [side]: { ...res[side], [kind]: value } };
}

/** Field errors for a resources object (empty when valid). Values are trimmed by the caller. */
export function validateResources(res: AppResources): ResourceErrors {
  const errors: ResourceErrors = {};
  const cpuReq = parseCpu(res.requests.cpu);
  const cpuLim = parseCpu(res.limits.cpu);
  const memReq = parseMemory(res.requests.memory);
  const memLim = parseMemory(res.limits.memory);
  const cpuFormat = "Use millicores (250m) or cores (0.5, 2)";
  const memFormat = "Use Mi or Gi (256Mi, 1Gi)";

  if (cpuReq === undefined || cpuReq <= 0) errors["requests.cpu"] = cpuFormat;
  if (cpuLim === undefined || cpuLim <= 0) errors["limits.cpu"] = cpuFormat;
  else if (cpuLim > MAX_CPU_CORES) errors["limits.cpu"] = `At most ${MAX_CPU_CORES} cores`;
  else if (cpuReq !== undefined && cpuLim < cpuReq) errors["limits.cpu"] = "Must be at least the CPU request";

  if (memReq === undefined) errors["requests.memory"] = memFormat;
  if (memLim === undefined) errors["limits.memory"] = memFormat;
  else if (memLim > MAX_MEMORY_MI) errors["limits.memory"] = "At most 2Gi";
  else if (memReq !== undefined && memLim < memReq) errors["limits.memory"] = "Must be at least the memory request";

  return errors;
}

/** Trim every value. */
export function trimResources(res: AppResources): AppResources {
  return {
    requests: { cpu: res.requests.cpu.trim(), memory: res.requests.memory.trim() },
    limits: { cpu: res.limits.cpu.trim(), memory: res.limits.memory.trim() },
  };
}
