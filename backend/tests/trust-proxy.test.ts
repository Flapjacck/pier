import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { listAudit } from "../src/db/audit.js";
import { openDatabase } from "../src/db/open.js";
import { parseTrustProxy, type TrustProxy } from "../src/trust-proxy.js";
import { createFailedClientsResult } from "./helpers/fake-clients.js";
import { TEST_TOKEN, testConfig } from "./helpers/test-config.js";

describe("parseTrustProxy", () => {
  for (const raw of [undefined, "", "  ", "false", "FALSE", "0"]) {
    it(`${JSON.stringify(raw)} is off`, () => assert.equal(parseTrustProxy(raw), false));
  }
  for (const raw of ["true", " True ", "1"]) {
    it(`${JSON.stringify(raw)} trusts every hop`, () => assert.equal(parseTrustProxy(raw), true));
  }
  it("parses a comma-separated IP/CIDR list", () => {
    assert.deepEqual(parseTrustProxy(" 10.42.0.0/16, 192.0.2.10 ,fd00::/8,"), ["10.42.0.0/16", "192.0.2.10", "fd00::/8"]);
  });
  for (const raw of ["2", "yes", "10.42.0.0/33", "10.42.0.0/16,nope", "300.1.1.1", ","]) {
    it(`rejects ${JSON.stringify(raw)}`, () => assert.throws(() => parseTrustProxy(raw), /Invalid PIER_TRUST_PROXY/));
  }
  it("loadConfig reads PIER_TRUST_PROXY", () => {
    assert.deepEqual(loadConfig({ PIER_TRUST_PROXY: "10.42.0.0/16" }).trustProxy, ["10.42.0.0/16"]);
    assert.equal(loadConfig({}).trustProxy, false);
  });
});

const TRAEFIK = "10.42.0.123";
const CLIENT = "192.168.1.50";

async function appWith(trustProxy: TrustProxy) {
  const db = openDatabase(":memory:");
  const app = await buildApp(testConfig({ trustProxy }), { logger: false, db, k8s: createFailedClientsResult() });
  const login = (remoteAddress: string, xff: string | undefined, token = TEST_TOKEN) =>
    app.inject({
      method: "POST",
      url: "/api/login",
      remoteAddress,
      headers: xff === undefined ? {} : { "x-forwarded-for": xff },
      payload: { token },
    });
  const lastIp = () => listAudit(db, { limit: 1 }).entries[0]?.ip;
  return { app, login, lastIp };
}

describe("client IP behind a trusted proxy", () => {
  it("uses the X-Forwarded-For client when the peer is in a trusted CIDR", async () => {
    const { app, login, lastIp } = await appWith(["10.42.0.0/16"]);
    assert.equal((await login(TRAEFIK, CLIENT)).statusCode, 204);
    assert.equal(lastIp(), CLIENT);
    // A forged entry to the left of the proxy-appended one is ignored.
    assert.equal((await login(TRAEFIK, `1.2.3.4, ${CLIENT}`)).statusCode, 204);
    assert.equal(lastIp(), CLIENT);
    await app.close();
  });

  it("ignores X-Forwarded-For from an untrusted peer", async () => {
    const { app, login, lastIp } = await appWith(["10.42.0.0/16"]);
    assert.equal((await login(CLIENT, "1.2.3.4")).statusCode, 204);
    assert.equal(lastIp(), CLIENT);
    await app.close();
  });

  it("ignores X-Forwarded-For when trust is off", async () => {
    const { app, login, lastIp } = await appWith(false);
    assert.equal((await login(TRAEFIK, CLIENT)).statusCode, 204);
    assert.equal(lastIp(), TRAEFIK);
    await app.close();
  });

  it("limits clients behind the proxy separately, and spoofing does not dodge the limit", async () => {
    const { app, login } = await appWith(["10.42.0.0/16"]);
    for (let i = 0; i < 5; i++) assert.equal((await login(TRAEFIK, CLIENT, "wrong")).statusCode, 401);
    assert.equal((await login(TRAEFIK, CLIENT, "wrong")).statusCode, 429);
    assert.equal((await login(TRAEFIK, `1.2.3.4, ${CLIENT}`, "wrong")).statusCode, 429);
    // Another client through the same proxy is not locked out.
    assert.equal((await login(TRAEFIK, "192.168.1.51", "wrong")).statusCode, 401);
    await app.close();
  });
});
