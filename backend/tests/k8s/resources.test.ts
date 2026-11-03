import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_RESOURCES,
  mergeResources,
  parseQuantity,
  resourcesFromContainer,
  resourcesProblem,
  toContainerResources,
} from "../../src/k8s/resources.js";
import { deploymentToApp } from "../../src/k8s/apps.js";

describe("parseQuantity", () => {
  it("parses CPU quantities into cores", () => {
    assert.equal(parseQuantity("500m"), 0.5);
    assert.equal(parseQuantity("2"), 2);
    assert.equal(parseQuantity("0.25"), 0.25);
  });

  it("parses binary, decimal and exponent memory quantities into bytes", () => {
    assert.equal(parseQuantity("256Mi"), 256 * 2 ** 20);
    assert.equal(parseQuantity("2Gi"), 2 * 2 ** 30);
    assert.equal(parseQuantity("1G"), 1e9);
    assert.equal(parseQuantity("1e3"), 1000);
    assert.equal(parseQuantity("0"), 0);
  });

  it("returns undefined for junk", () => {
    assert.equal(parseQuantity(""), undefined);
    assert.equal(parseQuantity("lots"), undefined);
    assert.equal(parseQuantity("5Xi"), undefined);
  });
});

describe("mergeResources / resourcesProblem", () => {
  it("fills missing fields from the base", () => {
    const merged = mergeResources(DEFAULT_RESOURCES, { limits: { memory: "1Gi" } });
    assert.deepEqual(merged, {
      requests: { cpu: "50m", memory: "64Mi" },
      limits: { cpu: "500m", memory: "1Gi" },
    });
  });

  it("accepts the defaults", () => {
    assert.equal(resourcesProblem(DEFAULT_RESOURCES), undefined);
  });

  it("rejects a limit below its request", () => {
    const res = mergeResources(DEFAULT_RESOURCES, { requests: { cpu: "1" } });
    assert.match(resourcesProblem(res) ?? "", /limits\.cpu must be at least/);
  });

  it("rejects zero quantities", () => {
    const res = mergeResources(DEFAULT_RESOURCES, { requests: { cpu: "0" } });
    assert.match(resourcesProblem(res) ?? "", /requests\.cpu must be a positive quantity/);
  });
});

describe("container resources", () => {
  it("adds the fixed ephemeral-storage values", () => {
    const out = toContainerResources(DEFAULT_RESOURCES);
    assert.equal(out.requests?.["ephemeral-storage"], "64Mi");
    assert.equal(out.limits?.["ephemeral-storage"], "1Gi");
    assert.equal(out.limits?.cpu, "500m");
  });

  it("reads a container and defaults anything unset", () => {
    const res = resourcesFromContainer({
      name: "app",
      resources: { limits: { cpu: "1", memory: "512Mi" } },
    });
    assert.deepEqual(res, {
      requests: { cpu: "50m", memory: "64Mi" },
      limits: { cpu: "1", memory: "512Mi" },
    });
    assert.deepEqual(resourcesFromContainer(undefined), DEFAULT_RESOURCES);
  });
});

describe("deploymentToApp env and resources", () => {
  it("exposes plain env values and resources", () => {
    const app = deploymentToApp({
      metadata: { name: "hello", labels: { "pier.app": "hello" } },
      spec: {
        selector: {},
        template: {
          spec: {
            containers: [
              {
                name: "app",
                image: "nginx:1.27",
                env: [
                  { name: "A", value: "1" },
                  { name: "SECRET", valueFrom: { secretKeyRef: { name: "s", key: "k" } } },
                ],
                resources: { requests: { cpu: "100m", memory: "128Mi" }, limits: { cpu: "1", memory: "1Gi" } },
              },
            ],
          },
        },
      },
    });
    assert.deepEqual(app.env, { A: "1" });
    assert.deepEqual(app.resources, {
      requests: { cpu: "100m", memory: "128Mi" },
      limits: { cpu: "1", memory: "1Gi" },
    });
  });

  it("omits env when the container has none", () => {
    const app = deploymentToApp({
      metadata: { name: "hello" },
      spec: { selector: {}, template: { spec: { containers: [{ name: "app", image: "x" }] } } },
    });
    assert.equal(app.env, undefined);
    assert.deepEqual(app.resources, DEFAULT_RESOURCES);
  });
});
