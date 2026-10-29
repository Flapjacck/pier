import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type * as k8s from "@kubernetes/client-node";
import {
  listClusterPods,
  podToSummary,
  readyColumn,
} from "./list-pods.js";

describe("list-pods", () => {
  it("readyColumn counts ready containers", () => {
    const pod = {
      status: {
        containerStatuses: [{ ready: true }, { ready: false }],
      },
    } as k8s.V1Pod;
    assert.equal(readyColumn(pod), "1/2");
  });

  it("podToSummary maps metadata and phase", () => {
    const pod = {
      metadata: { name: "api-abc", namespace: "default" },
      spec: { nodeName: "node-1" },
      status: {
        phase: "Running",
        startTime: "2026-01-01T00:00:00Z",
        containerStatuses: [{ ready: true }],
      },
    } as k8s.V1Pod;

    assert.deepEqual(podToSummary(pod), {
      name: "api-abc",
      namespace: "default",
      phase: "Running",
      nodeName: "node-1",
      ready: "1/1",
      startedAt: "2026-01-01T00:00:00Z",
    });
  });

  it("listClusterPods returns summaries from the API client", async () => {
    const fakePod = {
      metadata: { name: "busybox", namespace: "kube-system" },
      status: { phase: "Running", containerStatuses: [{ ready: true }] },
    } as k8s.V1Pod;

    const kc = {
      makeApiClient: () => ({
        listPodForAllNamespaces: async () => ({ items: [fakePod] }),
      }),
    } as unknown as k8s.KubeConfig;

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
    } as unknown as k8s.KubeConfig;

    const result = await listClusterPods(kc, "in-cluster");
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /Forbidden/);
  });
});
