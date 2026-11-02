import { describe, it, expect } from "vitest";
import { mapApiErrorToFields } from "../../../src/pages/deploy/errorMapping";
import { ApiError } from "../../../src/api/errors";

describe("mapApiErrorToFields", () => {
  it("maps 409 name conflict to name field", () => {
    const err = new ApiError(409, { ok: false, error: "app already exists" });
    const errors = mapApiErrorToFields(err);
    expect(errors.name).toBe("App already exists");
  });

  it("maps 409 host conflict to host field", () => {
    const err = new ApiError(409, { ok: false, error: "host already in use" });
    const errors = mapApiErrorToFields(err);
    expect(errors.host).toBe("Host already in use");
  });

  it("maps generic 409 to form error", () => {
    const err = new ApiError(409, { ok: false, error: "conflict" });
    const errors = mapApiErrorToFields(err);
    expect(errors.form).toBe("The app or host already exists");
  });

  it("maps 400 with details to relevant field", () => {
    const err = new ApiError(400, {
      ok: false,
      error: "bad request",
      details: "port must be between 1 and 65535",
    });
    const errors = mapApiErrorToFields(err);
    expect(errors.port).toBe("port must be between 1 and 65535");
  });

  it("maps 400 without details to form error", () => {
    const err = new ApiError(400, { ok: false, error: "bad request" });
    const errors = mapApiErrorToFields(err);
    expect(errors.form).toBe("The server rejected the request (400)");
  });

  it("maps 403 to form error", () => {
    const err = new ApiError(403, {
      ok: false,
      error: "quota exceeded",
      details: "CPU limit reached",
    });
    const errors = mapApiErrorToFields(err);
    expect(errors.form).toContain("quota exceeded");
    expect(errors.form).toContain("CPU limit reached");
  });

  it("maps 422 rejected to form error", () => {
    const err = new ApiError(422, {
      ok: false,
      error: "rejected",
      details: "Pod Security policy violation",
    });
    const errors = mapApiErrorToFields(err);
    expect(errors.form).toContain("Rejected by cluster");
  });

  it("maps network error to form error", () => {
    const err = ApiError.network(new Error("timeout"));
    const errors = mapApiErrorToFields(err);
    expect(errors.form).toBeDefined();
    expect(errors.form).toContain("timeout");
  });

  it("maps unknown status to visible error", () => {
    const err = new ApiError(500, { ok: false, error: "internal server error" });
    const errors = mapApiErrorToFields(err);
    expect(errors.form).toBeDefined();
  });

  it("ensures at least one error message exists", () => {
    const err = new ApiError(999, null);
    const errors = mapApiErrorToFields(err);
    expect(Object.keys(errors).some((k) => errors[k as keyof typeof errors])).toBe(true);
  });
});
