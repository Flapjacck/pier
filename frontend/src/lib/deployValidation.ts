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
  /** Omitted or equal to DEFAULT_RESOURCES: nothing is sent and the backend defaults apply. */
  resources?: AppResources;
  volume?: { name: string; mountPath: string; size?: string };
};

export type FieldErrors = {
  name?: string;
  image?: string;
  port?: string;
  replicas?: string;
  host?: string;
  form?: string; // Form-level error shown once
  env?: Record<string, string>; // Keyed by env row id
  resources?: ResourceErrors;
  volume?: { name?: string; mountPath?: string; size?: string };
};

import type { AppResources, CreateAppBody } from "../api/client";
import { validateEnvRows } from "./envValidation";
import {
  DEFAULT_RESOURCES,
  sameResources,
  trimResources,
  validateResources,
  type ResourceErrors,
} from "./resources";
import { mountPathError, volumeSizeError } from "./volumeValidation";

export type ValidationResult =
  | { ok: true; body: CreateAppBody }
  | { ok: false; errors: FieldErrors };

/** Image rule shared with the Settings tab: 1–255 chars, no whitespace. Input is trimmed. */
export function imageError(image: string): string | undefined {
  if (!image) return "Image is required";
  if (image.length > 255) return "Image must be ≤255 characters";
  if (/\s/.test(image)) return "Image cannot contain whitespace";
  return undefined;
}

/** Port rule shared with the Settings tab: integer 1–65535. Input is trimmed. */
export function portError(port: string): string | undefined {
  if (!port) return "Port is required";
  const n = Number(port);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return "Port must be an integer between 1 and 65535";
  return undefined;
}

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
  const imageMsg = imageError(image);
  if (imageMsg) errors.image = imageMsg;

  // Validate port: 1–65535, must be an integer.
  const port = values.port.trim();
  const portMsg = portError(port);
  if (portMsg) errors.port = portMsg;

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

  const { env: envMap, errors: envErrors } = validateEnvRows(values.env);
  if (Object.keys(envErrors).length > 0) {
    errors.env = envErrors;
  }

  // Resources: only validated (and sent) when they differ from the backend defaults.
  const resources = values.resources ? trimResources(values.resources) : undefined;
  const sendResources = resources !== undefined && !sameResources(resources, DEFAULT_RESOURCES);
  if (sendResources) {
    const resourceErrors = validateResources(resources);
    if (Object.keys(resourceErrors).length > 0) errors.resources = resourceErrors;
  }

  // If there are any field errors, return them.
  if (Object.keys(errors).length > 0) {
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

  if (sendResources) {
    body.resources = resources;
  }
  if (values.volume) {
    const volumeErrors: FieldErrors["volume"] = {};
    if (!values.volume.name) volumeErrors.name = "Volume name is required";
    if (mountPathError(values.volume.mountPath)) volumeErrors.mountPath = mountPathError(values.volume.mountPath);
    if (values.volume.size && volumeSizeError(values.volume.size)) volumeErrors.size = volumeSizeError(values.volume.size);
    if (Object.keys(volumeErrors).length) {
      errors.volume = volumeErrors;
      return { ok: false, errors };
    }
    body.volumes = [values.volume];
  }

  return { ok: true, body };
}
