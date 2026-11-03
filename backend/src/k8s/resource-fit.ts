import type { CoreV1Api } from "@kubernetes/client-node";
import { apiStatusCode } from "./api-errors.js";
import { parseQuantity, type AppResources } from "./resources.js";

/** A container limit is above the namespace LimitRange max (would fail pod admission). */
export class ResourceLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceLimitError";
  }
}

/** The change would push the namespace over its ResourceQuota (pods would never be created). */
export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

/** An app's per-pod resources times its replica count. */
export type AppFootprint = { resources: AppResources; replicas: number };

export type ResourceFitInput = {
  /** What the app uses now (omit for a new app). */
  current?: AppFootprint;
  next: AppFootprint;
  /** The pod template changes, so a rolling update briefly runs one extra new pod. */
  surge: boolean;
};

type Logger = { warn: (obj: object, msg: string) => void };

const QUOTA_KEYS = [
  ["requests.cpu", "requests", "cpu"],
  ["requests.memory", "requests", "memory"],
  ["limits.cpu", "limits", "cpu"],
  ["limits.memory", "limits", "memory"],
] as const;

/**
 * Pre-check resources against the namespace's LimitRange max and ResourceQuota.
 * Both are only enforced when pods are created, so without this a PATCH would succeed and
 * the new pods would silently fail with FailedCreate. If Pier can't list either object
 * (403/404, e.g. old RBAC), that check is skipped and logged rather than blocking the change.
 */
export async function checkResourceFit(
  core: CoreV1Api,
  namespace: string,
  input: ResourceFitInput,
  log?: Logger,
): Promise<void> {
  await checkLimitRanges(core, namespace, input.next.resources, log);
  await checkQuotas(core, namespace, input, log);
}

async function listOrSkip<T>(fn: () => Promise<T>, what: string, log?: Logger): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    const code = apiStatusCode(err);
    if (code === 403 || code === 404) {
      log?.warn({ code }, `cannot list ${what}; skipping that resource check`);
      return undefined;
    }
    throw err;
  }
}

async function checkLimitRanges(
  core: CoreV1Api,
  namespace: string,
  res: AppResources,
  log?: Logger,
): Promise<void> {
  const list = await listOrSkip(() => core.listNamespacedLimitRange({ namespace }), "limitranges", log);
  for (const range of list?.items ?? []) {
    for (const item of range.spec?.limits ?? []) {
      if (item.type !== "Container") continue;
      for (const kind of ["cpu", "memory"] as const) {
        const max = item.max?.[kind];
        const maxValue = max === undefined ? undefined : parseQuantity(max);
        const limit = parseQuantity(res.limits[kind]);
        if (maxValue !== undefined && limit !== undefined && limit > maxValue) {
          throw new ResourceLimitError(
            `resources.limits.${kind} ${res.limits[kind]} is above the namespace max of ${max}`,
          );
        }
      }
    }
  }
}

async function checkQuotas(
  core: CoreV1Api,
  namespace: string,
  input: ResourceFitInput,
  log?: Logger,
): Promise<void> {
  const list = await listOrSkip(() => core.listNamespacedResourceQuota({ namespace }), "resourcequotas", log);
  const { current, next, surge } = input;
  for (const quota of list?.items ?? []) {
    const hard = quota.status?.hard ?? quota.spec?.hard ?? {};
    const used = quota.status?.used ?? {};
    for (const [key, side, kind] of QUOTA_KEYS) {
      const hardRaw = hard[key];
      const hardValue = hardRaw === undefined ? undefined : parseQuantity(hardRaw);
      if (hardValue === undefined) continue;
      const usedValue = parseQuantity(used[key] ?? "0") ?? 0;
      const perPod = parseQuantity(next.resources[side][kind]) ?? 0;
      const currentPerPod = current ? (parseQuantity(current.resources[side][kind]) ?? 0) : 0;
      const final = usedValue - currentPerPod * (current?.replicas ?? 0) + perPod * next.replicas;
      // Mid-rollout peak: every old pod is still running plus one new surge pod.
      const peak = surge && next.replicas > 0 ? usedValue + perPod : 0;
      const needed = Math.max(final, peak);
      if (needed > hardValue * (1 + 1e-9)) {
        const name = quota.metadata?.name ?? "namespace";
        throw new QuotaExceededError(
          `${key} would need ${formatQuantity(needed, kind)} but quota ${name} allows ${hardRaw}`,
        );
      }
    }
  }
}

function formatQuantity(value: number, kind: "cpu" | "memory"): string {
  if (kind === "cpu") return `${Math.round(value * 1000)}m`;
  return `${Math.round(value / 2 ** 20)}Mi`;
}
