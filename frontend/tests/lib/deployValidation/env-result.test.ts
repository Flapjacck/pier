import { describe, it, expect } from "vitest";
import { validateDeployForm } from "../../../src/lib/deployValidation";
import { validForm } from "../../helpers/deployForm";

describe("validateDeployForm", () => {
  describe("env validation", () => {
    it("skips blank env rows", () => {
      const result = validateDeployForm(
        {
          ...validForm,
          env: [
            { id: "1", key: "", value: "" },
            { id: "2", key: "KEY", value: "value" },
          ],
        },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.body.env?.KEY).toBe("value");
    });

    it("rejects missing key", () => {
      const result = validateDeployForm(
        {
          ...validForm,
          env: [{ id: "1", key: "", value: "value" }],
        },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.env).toBeDefined();
    });

    it("rejects invalid key format", () => {
      const result = validateDeployForm(
        {
          ...validForm,
          env: [{ id: "1", key: "1INVALID", value: "value" }],
        },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.env).toBeDefined();
    });

    it("rejects duplicate keys", () => {
      const result = validateDeployForm(
        {
          ...validForm,
          env: [
            { id: "1", key: "KEY", value: "val1" },
            { id: "2", key: "KEY", value: "val2" },
          ],
        },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.env).toBeDefined();
    });

    it("rejects value exceeding 4096 chars", () => {
      const result = validateDeployForm(
        {
          ...validForm,
          env: [{ id: "1", key: "KEY", value: "a".repeat(4097) }],
        },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.env).toBeDefined();
    });

    it("rejects more than 50 env vars", () => {
      const env = Array.from({ length: 51 }, (_, i) => ({
        id: String(i),
        key: `KEY${i}`,
        value: "value",
      }));
      const result = validateDeployForm(
        { ...validForm, env },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.env?.[""] === "Maximum 50 environment variables").toBe(true);
    });

    it("accepts valid env with underscores", () => {
      const result = validateDeployForm(
        {
          ...validForm,
          env: [{ id: "1", key: "_KEY_123", value: "value" }],
        },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(true);
    });
  });

  describe("result validation", () => {
    it("returns CreateAppBody on success", () => {
      const result = validateDeployForm(
        {
          ...validForm,
          env: [{ id: "1", key: "DB_URL", value: "postgres://..." }],
        },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.body.name).toBe("myapp");
        expect(result.body.image).toBe("nginx:latest");
        expect(result.body.port).toBe(8080);
        expect(result.body.replicas).toBe(3);
        expect(result.body.env?.DB_URL).toBe("postgres://...");
      }
    });
  });
});
