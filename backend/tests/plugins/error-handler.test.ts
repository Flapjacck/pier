import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { volumeDeployment } from "../helpers/fake-volume-cluster.js";
import { authHeader } from "../helpers/test-config.js";
import { volumeTestApp } from "../helpers/volume-app.js";

const jsonNoBody = { ...authHeader, "content-type": "application/json" };

describe("error handler", () => {
  it("returns a 400 in Pier's error shape for an empty JSON body on DELETE (not a 500)", async () => {
    const { app, cluster } = await volumeTestApp();
    cluster.deployments.set("web", volumeDeployment("web", []));
    for (const url of ["/api/apps/web", "/api/apps/web?deleteVolumes=true", "/api/volumes/web-data"]) {
      const res = await app.inject({ method: "DELETE", url, headers: jsonNoBody });
      assert.equal(res.statusCode, 400, url);
      const body = res.json();
      assert.equal(body.ok, false, url);
      assert.equal(body.error, "invalid request", url);
      assert.match(body.details, /Body cannot be empty/, url);
    }
    assert.equal(cluster.deployments.has("web"), true);
    await app.close();
  });

  it("returns 415 in Pier's error shape for an unsupported content type", async () => {
    const { app } = await volumeTestApp();
    const res = await app.inject({ method: "POST", url: "/api/volumes", headers: { ...authHeader, "content-type": "text/xml" }, payload: "<x/>" });
    assert.equal(res.statusCode, 415);
    assert.equal(res.json().ok, false);
    await app.close();
  });

  it("still deletes (204) when DELETE has no content type", async () => {
    const { app, cluster } = await volumeTestApp();
    cluster.deployments.set("web", volumeDeployment("web", []));
    const res = await app.inject({ method: "DELETE", url: "/api/apps/web", headers: authHeader });
    assert.equal(res.statusCode, 204);
    await app.close();
  });
});
