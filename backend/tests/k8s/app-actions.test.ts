import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type * as k8s from "@kubernetes/client-node";
import { restartApp } from "../../src/k8s/app-actions.js";

describe("restartApp", () => {
  it("adds restartedAt when the pod template already has other annotations", async () => {
    const patches: Array<{ op: string; path: string }> = [];
    const apps = {
      readNamespacedDeployment: async () => ({
        metadata: { name: "web", namespace: "pier-apps" },
        spec: {
          template: {
            metadata: { annotations: { "example.com/owner": "team-a" } },
          },
        },
      }),
      patchNamespacedDeployment: async (req: { body: typeof patches }) => {
        patches.push(...req.body);
        return {};
      },
    } as unknown as k8s.AppsV1Api;

    await restartApp(apps, "pier-apps", "web", new Date("2026-01-01T00:00:00Z"));

    assert.equal(patches.length, 1);
    assert.equal(patches[0].op, "add");
    assert.equal(
      patches[0].path,
      "/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt",
    );
  });
});
