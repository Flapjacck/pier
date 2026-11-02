import { describe, it, expect } from "vitest";
import { validateDeployForm } from "../../../src/lib/deployValidation";
import { validForm } from "../../helpers/deployForm";

describe("validateDeployForm", () => {
  describe("name validation", () => {
    it("accepts valid DNS-1035 name", () => {
      const result = validateDeployForm(validForm, { ingressDomain: null });
      expect(result.ok).toBe(true);
    });

    it("rejects empty name", () => {
      const result = validateDeployForm(
        { ...validForm, name: "" },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.name).toBeDefined();
    });

    it("rejects uppercase letters", () => {
      const result = validateDeployForm(
        { ...validForm, name: "MyApp" },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.name).toBeDefined();
    });

    it("rejects leading digit", () => {
      const result = validateDeployForm(
        { ...validForm, name: "1app" },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.name).toBeDefined();
    });

    it("rejects name exceeding 63 chars", () => {
      const result = validateDeployForm(
        { ...validForm, name: "a".repeat(64) },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.name).toBeDefined();
    });

    it("accepts names with hyphens", () => {
      const result = validateDeployForm(
        { ...validForm, name: "my-app-123" },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(true);
    });
  });

  describe("image validation", () => {
    it("rejects empty image", () => {
      const result = validateDeployForm(
        { ...validForm, image: "" },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.image).toBeDefined();
    });

    it("rejects image exceeding 255 chars", () => {
      const result = validateDeployForm(
        { ...validForm, image: "a".repeat(256) },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.image).toBeDefined();
    });

    it("rejects image with whitespace", () => {
      const result = validateDeployForm(
        { ...validForm, image: "nginx: latest" },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.image).toBeDefined();
    });
  });

  describe("port validation", () => {
    it("rejects empty port", () => {
      const result = validateDeployForm(
        { ...validForm, port: "" },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.port).toBeDefined();
    });

    it("rejects port < 1", () => {
      const result = validateDeployForm(
        { ...validForm, port: "0" },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.port).toBeDefined();
    });

    it("rejects port > 65535", () => {
      const result = validateDeployForm(
        { ...validForm, port: "65536" },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.port).toBeDefined();
    });

    it("rejects non-integer port", () => {
      const result = validateDeployForm(
        { ...validForm, port: "8080.5" },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.port).toBeDefined();
    });

    it("accepts valid port range", () => {
      const result = validateDeployForm(
        { ...validForm, port: "1" },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(true);

      const result2 = validateDeployForm(
        { ...validForm, port: "65535" },
        { ingressDomain: null }
      );
      expect(result2.ok).toBe(true);
    });
  });
});
