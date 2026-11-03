import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CoreV1Api } from "@kubernetes/client-node";
import {
  checkResourceFit,
  QuotaExceededError,
  ResourceLimitError,
} from "../../src/k8s/resource-fit.js";
import { DEFAULT_RESOURCES, mergeResources } from "../../src/k8s/resources.js";
import { FakeApiError } from "../helpers/fake-clients.js";

const limitRange = {
  items: [{ spec: { limits: [{ type: "Container", max: { cpu: "2", memory: "2Gi" } }] } }],
};

function quota(used: Record<string, string>) {
  return {
    items: [
      {
        metadata: { name: "pier-apps-quota" },
        status: {
          hard: { "requests.cpu": "2", "requests.memory": "4Gi", "limits.cpu": "4", "limits.memory": "6Gi" },
          used,
        },
      },
    ],
  };
}

function core(opts: { limits?: () => Promise<unknown>; quotas?: () => Promise<unknown> }): CoreV1Api {
  return {
    listNamespacedLimitRange: opts.limits ?? (async () => limitRange),
    listNamespacedResourceQuota: opts.quotas ?? (async () => quota({})),
  } as unknown as CoreV1Api;
}

const big = mergeResources(DEFAULT_RESOURCES, { requests: { cpu: "1" }, limits: { cpu: "2", memory: "1Gi" } });

describe("checkResourceFit", () => {
  it("passes when everything fits", async () => {
    await checkResourceFit(core({}), "pier-apps", { next: { resources: big, replicas: 1 }, surge: false });
  });

  it("rejects a limit above the LimitRange max", async () => {
    const tooBig = mergeResources(DEFAULT_RESOURCES, { limits: { memory: "4Gi" } });
    await assert.rejects(
      checkResourceFit(core({}), "pier-apps", { next: { resources: tooBig, replicas: 1 }, surge: false }),
      (err: unknown) => err instanceof ResourceLimitError && /limits\.memory 4Gi .* max of 2Gi/.test(err.message),
    );
  });

  it("rejects when the final usage would exceed the quota", async () => {
    await assert.rejects(
      checkResourceFit(core({}), "pier-apps", { next: { resources: big, replicas: 3 }, surge: false }),
      (err: unknown) => err instanceof QuotaExceededError && /requests\.cpu would need 3000m/.test(err.message),
    );
  });

  it("subtracts what the app already uses", async () => {
    const current = { resources: big, replicas: 1 };
    // 1 CPU used by this app already; going to 2 replicas needs 2 total, which fits exactly.
    await checkResourceFit(core({ quotas: async () => quota({ "requests.cpu": "1" }) }), "pier-apps", {
      current,
      next: { resources: big, replicas: 2 },
      surge: false,
    });
  });

  it("counts the rolling-update surge pod when the template changes", async () => {
    const current = { resources: big, replicas: 2 };
    const fits = core({ quotas: async () => quota({ "requests.cpu": "2", "limits.cpu": "4" }) });
    // Same totals after the rollout, but one extra new pod mid-rollout needs 3 CPU requested.
    await checkResourceFit(fits, "pier-apps", { current, next: { resources: big, replicas: 2 }, surge: false });
    await assert.rejects(
      checkResourceFit(fits, "pier-apps", { current, next: { resources: big, replicas: 2 }, surge: true }),
      QuotaExceededError,
    );
  });

  it("skips a check it isn't allowed to list", async () => {
    const forbidden = async () => {
      throw new FakeApiError(403);
    };
    const warnings: string[] = [];
    await checkResourceFit(
      core({ limits: forbidden, quotas: forbidden }),
      "pier-apps",
      { next: { resources: big, replicas: 9 }, surge: true },
      { warn: (_obj, msg) => warnings.push(msg) },
    );
    assert.equal(warnings.length, 2);
  });

  it("rethrows other API errors", async () => {
    await assert.rejects(
      checkResourceFit(
        core({ quotas: async () => { throw new FakeApiError(500); } }),
        "pier-apps",
        { next: { resources: big, replicas: 1 }, surge: false },
      ),
      FakeApiError,
    );
  });
});
