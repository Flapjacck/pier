/**
 * Deploy form validation — shared client-side validation that mirrors POST /api/apps.
 * Returns typed errors keyed by field (for display near form fields) or generic messages.
 */

export type DeployFormValues = {
  name: string;
  image: string;
  port: string;
  replicas: string;
  host: string;
  env: Array<{ id: string; key: string; value: string }>;
  publicUrl: boolean;
};

export type FieldErrors = {
  name?: string;
  image?: string;
  port?: string;
  replicas?: string;
  host?: string;
  form?: string; // Form-level error shown once
  env?: Record<string, string>; // Keyed by env row id
};

import type { CreateAppBody } from "../api/client";

export type ValidationResult =
  | { ok: true; body: CreateAppBody }
  | { ok: false; errors: FieldErrors };

interface ValidationOptions {
  ingressDomain: string | null;
}

/**
 * Validate deploy form values and return a CreateAppBody or field errors.
 * Mirrors the backend rules from apps-schemas.ts.
 */
export function validateDeployForm(
  values: DeployFormValues,
  opts: ValidationOptions,
): ValidationResult {
  const errors: FieldErrors = {};
  const envErrors: Record<string, string> = {};

  // Validate name: DNS-1035 — lowercase start, ≤63 chars total.
  // Pattern: ^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$
  const name = values.name.trim();
  if (!name) {
    errors.name = "Name is required";
  } else if (!/^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$/.test(name)) {
    errors.name = "Name must start with a lowercase letter, contain only lowercase letters, numbers, and hyphens, and be ≤63 characters";
  }

  // Validate image: 1–255 chars, no whitespace.
  const image = values.image.trim();
  if (!image) {
    errors.image = "Image is required";
  } else if (image.length > 255) {
    errors.image = "Image must be ≤255 characters";
  } else if (/\s/.test(image)) {
    errors.image = "Image cannot contain whitespace";
  }

  // Validate port: 1–65535, must be an integer.
  const port = values.port.trim();
  if (!port) {
    errors.port = "Port is required";
  } else {
    const portNum = Number(port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      errors.port = "Port must be an integer between 1 and 65535";
    }
  }

  // Validate replicas: 0–10, must be an integer.
  const replicas = values.replicas.trim();
  if (!replicas) {
    errors.replicas = "Replicas is required";
  } else {
    const replicasNum = Number(replicas);
    if (
      !Number.isInteger(replicasNum) ||
      replicasNum < 0 ||
      replicasNum > 10
    ) {
      errors.replicas = "Replicas must be an integer between 0 and 10";
    }
  }

  // Validate host (optional, but if provided must match ingress rules).
  let host: string | undefined;
  if (values.publicUrl) {
    const hostInput = values.host.trim().toLowerCase();
    if (!hostInput) {
      errors.host = "Host is required when Public URL is enabled";
    } else if (hostInput.length > 253) {
      errors.host = "Host must be ≤253 characters";
    } else if (hostInput.includes("*")) {
      errors.host = "Host cannot contain wildcards";
    } else if (opts.ingressDomain) {
      // Host must end with .<ingressDomain> and not equal the domain itself.
      if (!hostInput.endsWith(`.${opts.ingressDomain}`)) {
        errors.host = `Host must end with .${opts.ingressDomain}`;
      } else if (hostInput === opts.ingressDomain) {
        errors.host = `Host cannot be the domain itself`;
      } else {
        host = hostInput;
      }
    } else {
      errors.host = "Ingress isn't configured on this Pier";
    }
  } else if (!opts.ingressDomain) {
    // Public URL is off and ingress is not configured — that's OK, no host will be sent.
    host = undefined;
  }

  // Validate env: up to 50 keys, keys match ^[A-Za-z_][A-Za-z0-9_]*$, values ≤4096 chars.
  const envMap: Record<string, string> = {};
  const seenKeys = new Set<string>();
  let envRowCount = 0;

  for (const row of values.env) {
    const key = row.key.trim();
    const value = row.value.trim();

    // Skip blank rows.
    if (!key && !value) continue;

    envRowCount++;

    if (!key) {
      envErrors[row.id] = "Key is required";
    } else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      envErrors[row.id] = "Key must start with a letter or underscore, contain only alphanumeric characters and underscores";
    } else if (seenKeys.has(key)) {
      envErrors[row.id] = "Duplicate key";
    } else if (value.length > 4096) {
      envErrors[row.id] = "Value must be ≤4096 characters";
    } else {
      seenKeys.add(key);
      envMap[key] = value;
    }
  }

  if (envRowCount > 50) {
    errors.env = { "": "Maximum 50 environment variables" };
  }

  // If there are any field errors, return them.
  if (Object.keys(errors).length > 0 || Object.keys(envErrors).length > 0) {
    if (Object.keys(envErrors).length > 0) {
      errors.env = envErrors;
    }
    return { ok: false, errors };
  }

  // Build the body.
  const body: CreateAppBody = {
    name,
    image,
    port: Number(port),
    replicas: Number(replicas),
  };

  if (host) {
    body.host = host;
  }

  if (Object.keys(envMap).length > 0) {
    body.env = envMap;
  }

  return { ok: true, body };
}
