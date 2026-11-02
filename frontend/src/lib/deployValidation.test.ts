import { describe, it, expect } from "vitest";
import { validateDeployForm, type DeployFormValues } from "./deployValidation";

const validForm: DeployFormValues = {
  name: "myapp",
  image: "nginx:latest",
  port: "8080",
  replicas: "3",
  host: "",
  env: [],
  publicUrl: false,
};

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
