import { describe, it, expect } from "vitest";
import { apiErrorFromResponse } from "./errors";

describe("apiErrorFromResponse", () => {
  it("creates error from 400 validation error", () => {
    const err = apiErrorFromResponse(400, { ok: false, error: "bad request" });
    expect(err.status).toBe(400);
    expect(err.kind).toBe("validation");
    expect(err.error).toBe("bad request");
  });

  it("creates error from 401 unauthorized", () => {
    const err = apiErrorFromResponse(401, { ok: false, error: "session expired" });
    expect(err.status).toBe(401);
    expect(err.kind).toBe("unauthorized");
  });

  it("creates error from 403 forbidden", () => {
    const err = apiErrorFromResponse(403, { ok: false, error: "forbidden" });
    expect(err.status).toBe(403);
    expect(err.kind).toBe("forbidden");
  });

  it("creates error from 404 not found", () => {
    const err = apiErrorFromResponse(404, { ok: false, error: "not found" });
    expect(err.status).toBe(404);
    expect(err.kind).toBe("not_found");
  });

  it("creates error from 409 conflict", () => {
    const err = apiErrorFromResponse(409, { ok: false, error: "app already exists" });
    expect(err.status).toBe(409);
    expect(err.kind).toBe("conflict");
  });

  it("creates error from 422 rejected", () => {
    const err = apiErrorFromResponse(422, { ok: false, error: "rejected" });
    expect(err.status).toBe(422);
    expect(err.kind).toBe("rejected");
  });

  it("creates error from 500 unknown", () => {
    const err = apiErrorFromResponse(500, { ok: false, error: "internal server error" });
    expect(err.status).toBe(500);
    expect(err.kind).toBe("unknown");
  });

  it("creates error from 503 unavailable", () => {
    const err = apiErrorFromResponse(503, { ok: false, error: "service unavailable" });
    expect(err.status).toBe(503);
    expect(err.kind).toBe("unavailable");
  });

  it("includes details when present", () => {
    const err = apiErrorFromResponse(400, {
      ok: false,
      error: "validation error",
      details: "port must be between 1 and 65535",
    });
    expect(err.details).toBe("port must be between 1 and 65535");
  });

  it("handles malformed body", () => {
    const err = apiErrorFromResponse(400, null);
    expect(err.status).toBe(400);
    expect(err.error).toBe("request failed");
  });

  it("handles non-object body", () => {
    const err = apiErrorFromResponse(400, "not an object");
    expect(err.status).toBe(400);
    expect(err.error).toBe("request failed");
  });
});
