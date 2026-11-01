import { isApiErrorBody } from "./guards";
import type { ApiErrorBody } from "./types";

export type ApiErrorKind =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "rejected"
  | "rate_limited"
  | "unavailable"
  | "network"
  | "unknown";

export class ApiError extends Error {
  readonly status: number;
  readonly error: string;
  readonly details?: string;
  readonly kind: ApiErrorKind;

  constructor(status: number, body: ApiErrorBody | null, kindOverride?: ApiErrorKind) {
    const message = body?.error ?? "request failed";
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.error = message;
    this.details = body?.details;
    this.kind = kindOverride ?? classifyError(status, message);
  }

  static network(cause?: unknown): ApiError {
    const err = new ApiError(0, { ok: false, error: "network error" }, "network");
    if (cause instanceof Error && cause.message) {
      err.message = cause.message;
    }
    return err;
  }
}

function classifyError(status: number, _message: string): ApiErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 400) return "validation";
  if (status === 422) return "rejected";
  if (status === 429) return "rate_limited";
  if (status === 503) return "unavailable";
  return "unknown";
}

export function apiErrorFromResponse(status: number, json: unknown): ApiError {
  if (isApiErrorBody(json)) {
    return new ApiError(status, json);
  }
  return new ApiError(status, { ok: false, error: "request failed" });
}
