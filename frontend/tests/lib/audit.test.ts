import { describe, expect, it } from "vitest";
import { actionLabel, actorLabel, formatDetails, targetHref } from "../../src/lib/audit";

describe("audit formatting", () => {
  it("labels known actions and passes unknown ones through", () => {
    expect(actionLabel("app.scale")).toBe("Scaled");
    expect(actionLabel("session.login")).toBe("Signed in");
    expect(actionLabel("future.thing")).toBe("future.thing");
    expect(actionLabel("deploy.failed")).toBe("Deploy failed");
    expect(actionLabel("app.redeploy")).toBe("Redeployed");
    expect(actionLabel("git-credential.create")).toBe("Added git credential");
  });

  it("links deploy rows to their deploy page only", () => {
    expect(targetHref({ action: "deploy.failed", app: "web app", target: "12" })).toBe("/apps/web%20app/deployments/12");
    expect(targetHref({ action: "deploy.failed", app: null, target: "12" })).toBeUndefined();
    expect(targetHref({ action: "deploy.failed", app: "web", target: "abc" })).toBeUndefined();
    expect(targetHref({ action: "volume.delete", app: "web", target: "12" })).toBeUndefined();
  });

  it("labels background rows as Pier", () => {
    expect(actorLabel({ actor: "pier", ip: "" })).toBe("Pier");
    expect(actorLabel({ actor: "session", ip: "192.0.2.1" })).toBe("session · 192.0.2.1");
    expect(actorLabel({ actor: "token", ip: "" })).toBe("token");
  });

  it("summarises details on one line", () => {
    expect(formatDetails({ image: "nginx:1.27", replicas: 2, envKeys: ["A", "B"] })).toBe("image nginx:1.27 · replicas 2 · env A, B");
    expect(formatDetails({ deleteVolumes: false, volumes: [] })).toBe("delete volumes no · volumes none");
    expect(formatDetails({})).toBe("");
  });
});
