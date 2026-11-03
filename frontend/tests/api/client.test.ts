import { describe, it, expect } from "vitest";
import { appLogsUrl, appPodLogsUrl } from "../../src/api/client";
import { parseApp, parseAppList } from "../../src/api/guards";

describe("appLogsUrl", () => {
  it("encodes app name in URL", () => {
    const url = appLogsUrl("my-app");
    expect(url).toBe("/api/apps/my-app/logs");
  });

  describe("appPodLogsUrl", () => {
    it("encodes app and pod names and requests the previous container", () => {
      expect(appPodLogsUrl("my app", "pod/1")).toBe(
        "/api/apps/my%20app/logs?pod=pod%2F1&tail=500&previous=true",
      );
    });
  });

  it("encodes special characters in name", () => {
    const url = appLogsUrl("app-with spaces&special");
    expect(url).toContain("/api/apps/app-with%20spaces%26special/logs");
  });

  it("includes follow parameter", () => {
    const url = appLogsUrl("myapp", { follow: true });
    expect(url).toContain("follow=true");
  });

  it("includes pod parameter", () => {
    const url = appLogsUrl("myapp", { pod: "pod-123" });
    expect(url).toContain("pod=pod-123");
  });

  it("includes tail parameter", () => {
    const url = appLogsUrl("myapp", { tail: 500 });
    expect(url).toContain("tail=500");
  });

  it("includes all parameters together", () => {
    const url = appLogsUrl("myapp", { follow: true, pod: "pod-1", tail: 200 });
    expect(url).toContain("follow=true");
    expect(url).toContain("pod=pod-1");
    expect(url).toContain("tail=200");
  });

  it("omits parameters when not set", () => {
    const url = appLogsUrl("myapp");
    expect(url).toBe("/api/apps/myapp/logs");
  });
});

describe("parseApp", () => {
  it("parses valid app object", () => {
    const app = parseApp({
      name: "myapp",
      image: "nginx:latest",
      replicas: 3,
      ready: 3,
      status: "running",
      createdAt: "2024-01-01T00:00:00Z",
    });

    expect(app.name).toBe("myapp");
    expect(app.image).toBe("nginx:latest");
    expect(app.replicas).toBe(3);
    expect(app.ready).toBe(3);
    expect(app.status).toBe("running");
  });

  it("rejects missing required fields", () => {
    expect(() =>
      parseApp({
        name: "myapp",
        image: "nginx:latest",
        // missing replicas and other fields
      })
    ).toThrow();
  });

  it("includes optional port and host", () => {
    const app = parseApp({
      name: "myapp",
      image: "nginx:latest",
      replicas: 1,
      ready: 1,
      status: "running",
      createdAt: "2024-01-01T00:00:00Z",
      port: 8080,
      host: "myapp.example.com",
      url: "http://myapp.example.com",
    });

    expect(app.port).toBe(8080);
    expect(app.host).toBe("myapp.example.com");
    expect(app.url).toBe("http://myapp.example.com");
  });
});

describe("parseAppList", () => {
  it("parses array of apps", () => {
    const apps = parseAppList([
      {
        name: "app1",
        image: "image1",
        replicas: 1,
        ready: 1,
        status: "running",
        createdAt: "2024-01-01T00:00:00Z",
      },
      {
        name: "app2",
        image: "image2",
        replicas: 2,
        ready: 1,
        status: "building",
        createdAt: "2024-01-02T00:00:00Z",
      },
    ]);

    expect(apps).toHaveLength(2);
    expect(apps[0].name).toBe("app1");
    expect(apps[1].name).toBe("app2");
  });

  it("rejects non-array input", () => {
    expect(() => parseAppList({ items: [] })).toThrow();
  });

  it("rejects invalid app in list", () => {
    expect(() =>
      parseAppList([
        {
          name: "app1",
          image: "image1",
          replicas: 1,
          ready: 1,
          status: "running",
          createdAt: "2024-01-01T00:00:00Z",
        },
        {
          // missing required fields
          name: "app2",
        },
      ])
    ).toThrow();
  });
});
