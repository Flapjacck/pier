import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSession, verifySession } from "../../src/plugins/session.js";

const TEST_TOKEN = "test-token-secret";

describe("session plugin", () => {
  describe("createSession and verifySession", () => {
    it("creates and verifies a valid session", () => {
      const now = Date.now();
      const value = createSession(TEST_TOKEN, now);

      // Should verify immediately.
      assert.equal(verifySession(TEST_TOKEN, value, now), true);
    });

    it("rejects a session when the token is rotated (changed)", () => {
      const now = Date.now();
      const value = createSession(TEST_TOKEN, now);

      // Session cannot be verified with a different token.
      const differentToken = "different-token";
      assert.equal(verifySession(differentToken, value, now), false);
    });

    it("rejects an expired session", () => {
      const now = Date.now();
      const value = createSession(TEST_TOKEN, now);

      // Verify it works initially.
      assert.equal(verifySession(TEST_TOKEN, value, now), true);

      // Move time forward past 7 days (604800000 ms).
      const expiredTime = now + 7 * 24 * 60 * 60 * 1000 + 1;
      assert.equal(verifySession(TEST_TOKEN, value, expiredTime), false);
    });

    it("rejects a session just before expiry (edge case)", () => {
      const now = Date.now();
      const value = createSession(TEST_TOKEN, now);

      // One millisecond before expiry should still work.
      const almostExpired = now + 7 * 24 * 60 * 60 * 1000 - 1;
      assert.equal(verifySession(TEST_TOKEN, value, almostExpired), true);

      // One millisecond after expiry should fail.
      const expired = now + 7 * 24 * 60 * 60 * 1000 + 1;
      assert.equal(verifySession(TEST_TOKEN, value, expired), false);
    });

    it("rejects a malformed session (missing version)", () => {
      // Missing v1 prefix.
      assert.equal(verifySession(TEST_TOKEN, "v2.12345.sig", Date.now()), false);
    });

    it("rejects a malformed session (wrong number of parts)", () => {
      // Only 2 parts instead of 3.
      assert.equal(verifySession(TEST_TOKEN, "v1.12345", Date.now()), false);

      // 4 parts.
      assert.equal(verifySession(TEST_TOKEN, "v1.12345.sig.extra", Date.now()), false);
    });

    it("rejects a malformed session (invalid expiry timestamp)", () => {
      // Non-numeric expiry.
      assert.equal(verifySession(TEST_TOKEN, "v1.notanumber.sig", Date.now()), false);
    });

    it("rejects a tampered signature", () => {
      const now = Date.now();
      const value = createSession(TEST_TOKEN, now);

      // Extract parts and tamper with the signature.
      const parts = value.split(".");
      const tamperedValue = `${parts[0]}.${parts[1]}.tampered`;

      assert.equal(verifySession(TEST_TOKEN, tamperedValue, now), false);
    });

    it("rejects a session with an invalid base64url signature", () => {
      const now = Date.now();
      const value = createSession(TEST_TOKEN, now);

      const parts = value.split(".");
      // Use invalid base64url (e.g., with + and / characters only valid in standard base64).
      const invalidBase64 = "!!!invalid!!!";
      const invalidValue = `${parts[0]}.${parts[1]}.${invalidBase64}`;

      assert.equal(verifySession(TEST_TOKEN, invalidValue, now), false);
    });

    it("verifies a session created at the 7-day boundary", () => {
      const now = 1000000000;
      const value = createSession(TEST_TOKEN, now);

      // Verify at expiry (7 days = 604800000 ms).
      const atExpiry = now + 604800000;
      assert.equal(verifySession(TEST_TOKEN, value, atExpiry), true);

      // One ms after expiry.
      const afterExpiry = now + 604800001;
      assert.equal(verifySession(TEST_TOKEN, value, afterExpiry), false);
    });
  });
});
