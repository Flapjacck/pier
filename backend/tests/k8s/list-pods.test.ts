import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { KubeConfig, V1Pod } from "@kubernetes/client-node";
import {
  listClusterPods,
  podToSummary,
  readyColumn,
} from "../../src/k8s/list-pods.js";

/** Minimal pod shapes for tests — full V1Pod is huge and not needed here. */
function podFixture(partial: Record<string, unknown>): V1Pod {
  return partial as unknown as V1Pod;
}

describe("list-pods", () => {
  it("readyColumn counts ready containers", () => {
    const pod = podFixture({
      status: {
        containerStatuses: [{ ready: true }, { ready: false }],
      },
    });
    assert.equal(readyColumn(pod), "1/2");
  });

  it("podToSummary maps metadata and phase", () => {
    const pod = podFixture({
      metadata: { name: "api-abc", namespace: "default" },
      spec: { nodeName: "node-1" },
      status: {
        phase: "Running",
        startTime: new Date("2026-01-01T00:00:00.000Z"),
        containerStatuses: [{ ready: true }],
      },
    });

    assert.deepEqual(podToSummary(pod), {
      name: "api-abc",
      namespace: "default",
      phase: "Running",
      nodeName: "node-1",
      ready: "1/1",
      startedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("listClusterPods returns summaries from the API client", async () => {
    const fakePod = podFixture({
      metadata: { name: "busybox", namespace: "kube-system" },
      status: { phase: "Running", containerStatuses: [{ ready: true }] },
    });

    const kc = {
      makeApiClient: () => ({
        listPodForAllNamespaces: async () => ({ items: [fakePod] }),
      }),
    } as unknown as KubeConfig;

    const result = await listClusterPods(kc, "kubeconfig");
    assert.equal(result.ok, true);
    assert.equal(result.total, 1);
    assert.equal(result.pods?.[0]?.name, "busybox");
  });

  it("listClusterPods surfaces API errors", async () => {
    const kc = {
      makeApiClient: () => ({
        listPodForAllNamespaces: async () => {
          throw new Error("Forbidden");
        },
      }),
    } as unknown as KubeConfig;

    const result = await listClusterPods(kc, "in-cluster");
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /Forbidden/);
  });
});
