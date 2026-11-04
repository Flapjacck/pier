import { describe, expect, it } from "vitest";
import { actionLabel, formatDetails } from "../../src/lib/audit";

describe("audit formatting", () => {
  it("labels known actions and passes unknown ones through", () => {
    expect(actionLabel("app.scale")).toBe("Scaled");
    expect(actionLabel("session.login")).toBe("Signed in");
    expect(actionLabel("future.thing")).toBe("future.thing");
  });

  it("summarises details on one line", () => {
    expect(formatDetails({ image: "nginx:1.27", replicas: 2, envKeys: ["A", "B"] })).toBe("image nginx:1.27 · replicas 2 · env A, B");
    expect(formatDetails({ deleteVolumes: false, volumes: [] })).toBe("delete volumes no · volumes none");
    expect(formatDetails({})).toBe("");
  });
});
