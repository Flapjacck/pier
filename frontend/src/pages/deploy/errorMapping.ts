/**
 * Map API errors to form field errors for display.
 */

import { ApiError } from "../../api/errors";
import type { FieldErrors } from "../../lib/deployValidation";

/**
 * Map an API error from createApp() to form field errors.
 * Always returns at least one message.
 */
export function mapApiErrorToFields(err: ApiError): FieldErrors {
  const errors: FieldErrors = {};

  if (err.kind === "conflict") {
    // 409: app already exists or host in use.
    if (err.error === "app already exists") {
      errors.name = "App already exists";
    } else if (err.error === "host already in use") {
      errors.host = "Host already in use";
    } else {
      errors.form = "The app or host already exists";
    }
  } else if (err.kind === "validation") {
    // 400: invalid request
    if (err.details) {
      // Try to map to a field if the details mention it
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
        errors.form = err.details;
      }
    } else {
      errors.form = "The server rejected the request (400)";
    }
  } else if (err.kind === "rejected") {
    // 422: rejected by cluster (VAP, Pod Security, etc.)
    errors.form = err.details
      ? `Rejected by cluster: ${err.details}`
      : "Rejected by cluster";
  } else if (err.kind === "forbidden") {
    // 403: quota exceeded or forbidden
    errors.form = err.details
      ? `${err.error}: ${err.details}`
      : err.error;
  } else if (err.kind === "network" || err.kind === "unavailable") {
    // Network errors are shown as a banner, not form errors
    errors.form = err.message || "Network error";
  } else {
    // Any other status
    const msg = err.message || "Deploy failed";
    errors.form = msg;
  }

  // Ensure at least one error message exists
  if (!Object.keys(errors).some((k) => errors[k as keyof FieldErrors])) {
    errors.form = "Deploy failed";
  }

  return errors;
}
