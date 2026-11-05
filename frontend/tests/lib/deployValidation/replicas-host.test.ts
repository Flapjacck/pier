import { describe, it, expect } from "vitest";
import { validateDeployForm } from "../../../src/lib/deployValidation";
import { validForm } from "../../helpers/deployForm";

describe("validateDeployForm", () => {
  describe("replicas validation", () => {
    it("rejects empty replicas", () => {
      const result = validateDeployForm(
        { ...validForm, replicas: "" },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.replicas).toBeDefined();
    });

    it("rejects replicas < 0", () => {
      const result = validateDeployForm(
        { ...validForm, replicas: "-1" },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.replicas).toBeDefined();
    });

    it("rejects replicas > 10", () => {
      const result = validateDeployForm(
        { ...validForm, replicas: "11" },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.replicas).toBeDefined();
    });

    it("accepts replicas 0-10", () => {
      const result = validateDeployForm(
        { ...validForm, replicas: "0" },
        { ingressDomain: null }
      );
      expect(result.ok).toBe(true);

      const result2 = validateDeployForm(
        { ...validForm, replicas: "10" },
        { ingressDomain: null }
      );
      expect(result2.ok).toBe(true);
    });
  });

  describe("host validation", () => {
    it("ignores host when publicUrl is false", () => {
      const result = validateDeployForm(
        { ...validForm, publicUrl: false, host: "" },
        { ingressDomain: "example.com" }
      );
      expect(result.ok).toBe(true);
    });

    it("requires host when publicUrl is true with ingress configured", () => {
      const result = validateDeployForm(
        { ...validForm, publicUrl: true, host: "" },
        { ingressDomain: "example.com" }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.host).toBeDefined();
    });

    it("requires host to end with ingress domain", () => {
      const result = validateDeployForm(
        { ...validForm, publicUrl: true, host: "myapp.wrong.com" },
        { ingressDomain: "example.com" }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.host).toBeDefined();
    });

    it("rejects host equal to ingress domain", () => {
      const result = validateDeployForm(
        { ...validForm, publicUrl: true, host: "example.com" },
        { ingressDomain: "example.com" }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.host).toBeDefined();
    });

    it("accepts valid host with ingress domain", () => {
      const result = validateDeployForm(
        { ...validForm, publicUrl: true, host: "myapp.example.com" },
        { ingressDomain: "example.com" }
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.body.host).toBe("myapp.example.com");
    });

    it("appends ingress domain when only the subdomain is typed", () => {
      const result = validateDeployForm(
        { ...validForm, publicUrl: true, host: "myapp" },
        { ingressDomain: "example.com" }
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.body.host).toBe("myapp.example.com");
    });

    it("rejects host exceeding 253 chars", () => {
      const result = validateDeployForm(
        {
          ...validForm,
          publicUrl: true,
          host: "a".repeat(245) + ".example.com",
        },
        { ingressDomain: "example.com" }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.host).toBeDefined();
    });

    it("rejects host with wildcards", () => {
      const result = validateDeployForm(
        { ...validForm, publicUrl: true, host: "*.example.com" },
        { ingressDomain: "example.com" }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.host).toBeDefined();
    });
  });
});
