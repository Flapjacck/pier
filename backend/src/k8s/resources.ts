import type { V1Container, V1ResourceRequirements } from "@kubernetes/client-node";
import {
  CPU_LIMIT,
  CPU_REQUEST,
  EPHEMERAL_STORAGE_LIMIT,
  EPHEMERAL_STORAGE_REQUEST,
  MEMORY_LIMIT,
  MEMORY_REQUEST,
} from "./manifests/constants.js";

/** CPU and memory quantities for one side (requests or limits), e.g. { cpu: "250m", memory: "256Mi" }. */
export type ResourcePair = { cpu: string; memory: string };

/** Per-app CPU/RAM requests and limits. Ephemeral storage stays fixed (constants.ts). */
export type AppResources = { requests: ResourcePair; limits: ResourcePair };

/** Resources from a client may omit fields; omitted values are filled from a base. */
export type PartialAppResources = {
  requests?: Partial<ResourcePair>;
  limits?: Partial<ResourcePair>;
};

/** What every app got before resources were configurable; still the default. */
export const DEFAULT_RESOURCES: AppResources = {
  requests: { cpu: CPU_REQUEST, memory: MEMORY_REQUEST },
  limits: { cpu: CPU_LIMIT, memory: MEMORY_LIMIT },
};

const BINARY_SUFFIXES: Record<string, number> = {
  Ki: 2 ** 10,
  Mi: 2 ** 20,
  Gi: 2 ** 30,
  Ti: 2 ** 40,
  Pi: 2 ** 50,
  Ei: 2 ** 60,
};

const DECIMAL_SUFFIXES: Record<string, number> = {
  m: 1e-3,
  "": 1,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
};

/**
 * Parse a Kubernetes quantity ("500m", "2", "0.5", "256Mi", "1G", "1e3") into base units
 * (cores for CPU, bytes for memory). Returns undefined for anything unparsable.
 */
export function parseQuantity(value: string): number | undefined {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+))(?:([eE][+-]?\d+)|(Ki|Mi|Gi|Ti|Pi|Ei|m|k|M|G|T|P|E)?)$/.exec(
    value.trim(),
  );
  if (!match) return undefined;
  const base = Number(match[1]);
  if (match[2]) return base * 10 ** Number(match[2].slice(1));
  const suffix = match[3] ?? "";
  const factor = BINARY_SUFFIXES[suffix] ?? DECIMAL_SUFFIXES[suffix];
  return factor === undefined ? undefined : base * factor;
}

/** Fill any missing fields of `patch` from `base`. */
export function mergeResources(base: AppResources, patch?: PartialAppResources): AppResources {
  return {
    requests: { ...base.requests, ...patch?.requests },
    limits: { ...base.limits, ...patch?.limits },
  };
}

/**
 * Check a full resources object on its own (no cluster limits): every quantity must parse
 * and be > 0, and each limit must be at least its request. Returns a message or undefined.
 */
export function resourcesProblem(res: AppResources): string | undefined {
  for (const kind of ["cpu", "memory"] as const) {
    const request = parseQuantity(res.requests[kind]);
    const limit = parseQuantity(res.limits[kind]);
    if (request === undefined || request <= 0) {
      return `resources.requests.${kind} must be a positive quantity`;
    }
    if (limit === undefined || limit <= 0) {
      return `resources.limits.${kind} must be a positive quantity`;
    }
    if (limit < request) {
      return `resources.limits.${kind} must be at least resources.requests.${kind}`;
    }
  }
  return undefined;
}

/** Container resources for a manifest: the app's CPU/RAM plus the fixed ephemeral-storage values. */
export function toContainerResources(res: AppResources): V1ResourceRequirements {
  return {
    requests: {
      cpu: res.requests.cpu,
      memory: res.requests.memory,
      "ephemeral-storage": EPHEMERAL_STORAGE_REQUEST,
    },
    limits: {
      cpu: res.limits.cpu,
      memory: res.limits.memory,
      "ephemeral-storage": EPHEMERAL_STORAGE_LIMIT,
    },
  };
}

/** Read a container's CPU/RAM; any value it doesn't set falls back to DEFAULT_RESOURCES. */
export function resourcesFromContainer(container: V1Container | undefined): AppResources {
  const requests = container?.resources?.requests ?? {};
  const limits = container?.resources?.limits ?? {};
  return mergeResources(DEFAULT_RESOURCES, {
    requests: pickPair(requests),
    limits: pickPair(limits),
  });
}

function pickPair(values: Record<string, string>): Partial<ResourcePair> {
  const pair: Partial<ResourcePair> = {};
  if (typeof values.cpu === "string") pair.cpu = values.cpu;
  if (typeof values.memory === "string") pair.memory = values.memory;
  return pair;
}
