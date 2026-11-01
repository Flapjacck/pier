import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CoreV1Api, V1Pod } from "@kubernetes/client-node";
import {
  listAppPods,
  podToAppPod,
} from "../../src/k8s/app-pods.js";

function podFixture(partial: Record<string, unknown>): V1Pod {
  return partial as unknown as V1Pod;
}

describe("podToAppPod", () => {
  it("maps running pod with ready containers", () => {
    const pod = podFixture({
      metadata: {
        name: "app-pod-abc",
        creationTimestamp: new Date("2026-10-29T15:00:00.000Z"),
      },
      spec: { nodeName: "node-1" },
      status: {
        phase: "Running",
        startTime: new Date("2026-10-29T15:00:05.000Z"),
        containerStatuses: [{ name: "app", ready: true, restartCount: 0 }],
      },
    });

    const appPod = podToAppPod(pod);
    assert.equal(appPod.name, "app-pod-abc");
    assert.equal(appPod.phase, "Running");
    assert.equal(appPod.ready, true);
    assert.equal(appPod.readyContainers, "1/1");
    assert.equal(appPod.restarts, 0);
    assert.equal(appPod.node, "node-1");
    assert.equal(appPod.startedAt, "2026-10-29T15:00:05.000Z");
  });

  it("maps crash-looping pod with waiting reason", () => {
    const pod = podFixture({
      metadata: { name: "app-pod-crash" },
      spec: { nodeName: "node-2" },
      status: {
        phase: "Running",
        startTime: new Date("2026-10-29T15:00:00.000Z"),
        containerStatuses: [
          {
            name: "app",
            ready: false,
            restartCount: 5,
            state: { waiting: { reason: "CrashLoopBackOff" } },
            lastState: {
              terminated: {
                reason: "Error",
                exitCode: 1,
              },
            },
          },
        ],
      },
    });

    const appPod = podToAppPod(pod);
    assert.equal(appPod.ready, false);
    assert.equal(appPod.readyContainers, "0/1");
    assert.equal(appPod.restarts, 5);
    assert.equal(appPod.waitingReason, "CrashLoopBackOff");
    assert.equal(appPod.lastTerminationReason, "Error");
  });

  it("maps OOMKilled pod", () => {
    const pod = podFixture({
      metadata: { name: "app-pod-oom" },
      status: {
        phase: "Running",
        containerStatuses: [
          {
            name: "app",
            ready: false,
            restartCount: 2,
            lastState: {
              terminated: {
                reason: "OOMKilled",
              },
            },
          },
        ],
      },
    });

    const appPod = podToAppPod(pod);
    assert.equal(appPod.restarts, 2);
    assert.equal(appPod.lastTerminationReason, "OOMKilled");
  });

  it("maps multi-container restarts (sum)", () => {
    const pod = podFixture({
      metadata: { name: "multi-app" },
      status: {
        phase: "Running",
        containerStatuses: [
          { name: "app", ready: true, restartCount: 3 },
          { name: "sidecar", ready: true, restartCount: 2 },
        ],
      },
    });

    const appPod = podToAppPod(pod);
    assert.equal(appPod.readyContainers, "2/2");
    assert.equal(appPod.restarts, 5);
  });

  it("maps pending pod with no container statuses", () => {
    const pod = podFixture({
      metadata: { name: "pending-pod" },
      status: {
        phase: "Pending",
        containerStatuses: [],
      },
    });

    const appPod = podToAppPod(pod);
    assert.equal(appPod.phase, "Pending");
    assert.equal(appPod.ready, false);
    assert.equal(appPod.readyContainers, "0/0");
    assert.equal(appPod.restarts, 0);
  });
});

describe("listAppPods", () => {
  it("returns empty array when no pods", async () => {
    const fakeCore = {
      listNamespacedPod: async () => ({ items: [] }),
    } as unknown as CoreV1Api;

    const pods = await listAppPods(fakeCore, "pier-apps", "hello");
    assert.deepEqual(pods, []);
  });

  it("lists pods sorted by startTime descending (newest first)", async () => {
    let capturedSelector: string | undefined;
    const fakeCore = {
      listNamespacedPod: async (params: {
        namespace: string;
        labelSelector?: string;
      }) => {
        capturedSelector = params.labelSelector;
        return {
          items: [
            {
              metadata: { name: "pod-old" },
              status: {
                phase: "Running",
                startTime: new Date("2026-10-29T15:00:00.000Z"),
                containerStatuses: [{ ready: true, restartCount: 0 }],
              },
            },
            {
              metadata: { name: "pod-new" },
              status: {
                phase: "Running",
                startTime: new Date("2026-10-29T15:00:10.000Z"),
                containerStatuses: [{ ready: true, restartCount: 0 }],
              },
            },
          ],
        };
      },
    } as unknown as CoreV1Api;

    const pods = await listAppPods(fakeCore, "pier-apps", "hello");
    assert.equal(capturedSelector, "pier.app=hello");
    assert.equal(pods.length, 2);
    assert.equal(pods[0]!.name, "pod-new");
    assert.equal(pods[1]!.name, "pod-old");
  });
});
