import { describe, it, expect, beforeEach, vi } from "vitest";
import { request, requestVoid, setUnauthorizedHandler } from "./request";
import { ApiError } from "./errors";

describe("request", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    setUnauthorizedHandler(null);
  });

  it("parses JSON success response", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 1, name: "test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await request("/api/test", {
      parse: (json) => json as { id: number; name: string },
    });

    expect(result).toEqual({ id: 1, name: "test" });
    expect(mockFetch).toHaveBeenCalledWith("/api/test", expect.objectContaining({
      method: "GET",
      credentials: "same-origin",
    }));
  });

  it("sends credentials and JSON headers correctly", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(null), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await request("/api/test", {
      method: "POST",
      body: { key: "value" },
      parse: (json) => json,
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/test", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "value" }),
    }));
  });

  it("throws ApiError on error body", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockRejectedValueOnce(
      new Error("bad request")
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "bad request", details: "invalid field" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );

    try {
      await request("/api/test", { parse: (json) => json });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.kind).toBe("network");
    }

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "bad request", details: "invalid field" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );

    try {
      await request("/api/test", { parse: (json) => json });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.error).toBe("bad request");
      expect(apiErr.details).toBe("invalid field");
      expect(apiErr.kind).toBe("validation");
    }
  });

  it("handles non-JSON error body", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response("plain text error", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      })
    );

    try {
      await request("/api/test", { parse: (json) => json });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(500);
    }
  });

  it("throws network error on fetch failure", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockRejectedValueOnce(new Error("network timeout"));

    try {
      await request("/api/test", { parse: (json) => json });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.kind).toBe("network");
    }
  });

  it("calls unauthorized handler on 401 by default", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );

    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    try {
      await request("/api/test", { parse: (json) => json });
    } catch {
      /* expected */
    }

    expect(handler).toHaveBeenCalled();
  });

  it("skips unauthorized handler when skipAuthRedirect is true", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );

    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    try {
      await request("/api/test", {
        parse: (json) => json,
        skipAuthRedirect: true,
      });
    } catch {
      /* expected */
    }

    expect(handler).not.toHaveBeenCalled();
  });

  it("parses text as JSON on success", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ test: "value" }), {
        status: 200,
      })
    );

    const result = await request("/api/test", {
      parse: (json) => json,
    });

    expect(result).toEqual({ test: "value" });
  });

  it("requestVoid with DELETE method", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(null), {
        status: 200,
      })
    );

    await expect(
      requestVoid("/api/delete", { method: "DELETE" })
    ).resolves.toBeUndefined();

    expect(mockFetch).toHaveBeenCalledWith("/api/delete", expect.objectContaining({
      method: "DELETE",
    }));
  });
});
