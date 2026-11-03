import { describe, it, expect } from "vitest";
import { validateDeployForm } from "../../../src/lib/deployValidation";
import { DEFAULT_RESOURCES, RESOURCE_PRESETS, setResourceField } from "../../../src/lib/resources";
import { validForm } from "../../helpers/deployForm";

const opts = { ingressDomain: null };

describe("validateDeployForm resources", () => {
  it("leaves resources out when they're the defaults", () => {
    const result = validateDeployForm({ ...validForm, resources: DEFAULT_RESOURCES }, opts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.resources).toBeUndefined();
  });

  it("sends a non-default preset", () => {
    const large = RESOURCE_PRESETS.find((p) => p.id === "large");
    expect(large).toBeDefined();
    const result = validateDeployForm({ ...validForm, resources: large?.values }, opts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.resources).toEqual(large?.values);
  });

  it("returns resource field errors", () => {
    const resources = setResourceField(DEFAULT_RESOURCES, "limits.memory", "32Mi");
    const result = validateDeployForm({ ...validForm, resources }, opts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.resources?.["limits.memory"]).toMatch(/memory request/);
  });
});
