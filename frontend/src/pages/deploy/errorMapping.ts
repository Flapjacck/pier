/**
 * Map API errors to form field errors for display.
 */

import { ApiError } from "../../api/errors";
import type { FieldErrors } from "../../lib/deployValidation";

/**
 * Map an API error from createApp() to form field errors.
 * Handles 409 (conflict), 400 (validation), 422 (rejected), and 403 (forbidden).
 */
export function mapApiErrorToFields(err: ApiError): FieldErrors {
  const errors: FieldErrors = {};

  if (err.kind === "conflict") {
    // 409: app already exists or host in use.
    if (err.error === "app already exists") {
      errors.name = "App already exists";
    } else if (err.error === "host already in use") {
      errors.host = "Host already in use";
    }
  } else if (err.kind === "validation") {
    // 400: invalid request.
    if (err.details) {
      // Try to map to a field if the details mention it.
      if (err.details.includes("host")) {
        errors.host = err.details;
      } else if (err.details.includes("name")) {
        errors.name = err.details;
      } else if (err.details.includes("image")) {
        errors.image = err.details;
      } else if (err.details.includes("port")) {
        errors.port = err.details;
      } else if (err.details.includes("replicas")) {
        errors.replicas = err.details;
      } else if (err.details.includes("env")) {
        errors.env = { "": err.details };
      } else {
        // Generic form alert.
        errors.env = { "": err.details };
      }
    }
  } else if (err.kind === "rejected") {
    // 422: rejected by cluster (VAP, Pod Security, etc.).
    if (err.details) {
      errors.env = { "": `Rejected by cluster: ${err.details}` };
    } else {
      errors.env = { "": "Rejected by cluster" };
    }
  } else if (err.kind === "forbidden") {
    // 403: quota exceeded or forbidden.
    if (err.details) {
      errors.env = { "": `${err.error}: ${err.details}` };
    } else {
      errors.env = { "": err.error };
    }
  }

  return errors;
}
