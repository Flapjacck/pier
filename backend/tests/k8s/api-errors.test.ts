import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apiErrorMessage, apiStatusCode } from "../../src/k8s/api-errors.js";

describe("apiStatusCode", () => {
  it("returns statusCode from ApiException", () => {
    const err = { statusCode: 409 };
    assert.equal(apiStatusCode(err), 409);
  });

  it("returns code property as fallback", () => {
    const err = { code: 403 };
    assert.equal(apiStatusCode(err), 403);
  });

  it("returns undefined for null/undefined", () => {
    assert.equal(apiStatusCode(null), undefined);
    assert.equal(apiStatusCode(undefined), undefined);
  });

  it("returns undefined when no status code found", () => {
    const err = { message: "error" };
    assert.equal(apiStatusCode(err), undefined);
  });

  it("returns undefined for non-numeric statusCode", () => {
    const err = { statusCode: "404" };
    assert.equal(apiStatusCode(err), undefined);
  });

  it("returns code from a parsed JSON body", () => {
    const err = { body: JSON.stringify({ code: 404, message: "not found" }) };
    assert.equal(apiStatusCode(err), 404);
  });

  it("returns code from an object body", () => {
    const err = { body: { code: 503 } };
    assert.equal(apiStatusCode(err), 503);
  });
});

describe("apiErrorMessage", () => {
  it("extracts message from JSON string body", () => {
    const err = {
      body: JSON.stringify({ message: "exceeded quota: pier-apps-quota" }),
    };
    assert.equal(
      apiErrorMessage(err),
      "exceeded quota: pier-apps-quota"
    );
  });

  it("extracts message from object body", () => {
    const err = {
      body: { message: "pod security: non-compliant" },
    };
    assert.equal(apiErrorMessage(err), "pod security: non-compliant");
  });

  it("falls back to Error.message when body has no message", () => {
    const err = new Error("connection refused");
    assert.equal(apiErrorMessage(err), "connection refused");
  });

  it("returns undefined when body is unparseable and not an Error", () => {
    const err = {
      body: "not json",
      message: "fallback error", // not an Error instance, so .message ignored
    };
    const result = apiErrorMessage(err);
    // Our object isn't an instance of Error, so Error.message check fails
    assert.equal(result, undefined);
  });

  it("trims whitespace and limits to 300 characters", () => {
    const longMsg = "x".repeat(400);
    const err = new Error(`  ${longMsg}  `);
    const result = apiErrorMessage(err);
    assert.equal(result?.length, 300);
    assert.ok(!result!.startsWith(" "));
  });

  it("returns undefined for null/undefined", () => {
    assert.equal(apiErrorMessage(null), undefined);
    assert.equal(apiErrorMessage(undefined), undefined);
  });

  it("handles body with message field but non-string value", () => {
    const err = { body: { message: 123 } };
    const result = apiErrorMessage(err);
    // Since message is not a string, it should fall through
    assert.equal(result, undefined);
  });

  it("never returns raw body JSON string", () => {
    const largeBody = JSON.stringify({ data: "x".repeat(1000) });
    const err = { body: largeBody };
    const result = apiErrorMessage(err);
    // Should extract message if present, or return undefined
    // It should NOT be the entire JSON string
    assert.ok(result === undefined || !result?.includes("{"));
  });

  it("parses JSON body with nested structure but uses message field", () => {
    const err = {
      body: JSON.stringify({
        error: "ValidationError",
        message: "field 'image' is required",
        details: { path: "$.image" },
      }),
    };
    assert.equal(apiErrorMessage(err), "field 'image' is required");
  });
});
