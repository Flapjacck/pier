import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAuditEntry, parseAuditPage } from "../../src/api/auditGuards";
import { listAudit } from "../../src/api/client";

const entry = {
  id: 7, ts: "2026-11-04T12:00:00.000Z", actor: "token", ip: "192.0.2.1", action: "app.update",
  app: "web", target: null, status: 200, details: { fields: ["env", "image"], envKeys: ["API_KEY"] },
};

describe("audit guards", () => {
  it("parses a page of entries and its cursor", () => {
    expect(parseAuditPage({ ok: true, entries: [entry], nextBefore: 7 })).toEqual({ entries: [entry], nextBefore: 7 });
    expect(parseAuditPage({ ok: true, entries: [], nextBefore: null })).toEqual({ entries: [], nextBefore: null });
  });

  it("drops detail values of an unexpected type", () => {
    const parsed = parseAuditEntry({ ...entry, details: { replicas: 2, nested: { a: 1 }, mixed: ["a", 1], ok: true } });
    expect(parsed.details).toEqual({ replicas: 2, ok: true });
  });

  it("rejects malformed entries and pages", () => {
    expect(() => parseAuditEntry({ ...entry, actor: "root" })).toThrow(SyntaxError);
    expect(() => parseAuditEntry({ ...entry, app: 3 })).toThrow(SyntaxError);
    expect(() => parseAuditEntry({ ...entry, details: [] })).toThrow(SyntaxError);
    expect(() => parseAuditEntry({ ...entry, id: "7" })).toThrow(SyntaxError);
    expect(() => parseAuditPage({ ok: true, entries: [entry] })).toThrow(SyntaxError);
    expect(() => parseAuditPage({ ok: false, entries: [], nextBefore: null })).toThrow(SyntaxError);
    expect(() => parseAuditPage({ ok: true, entries: [{ id: 1 }], nextBefore: null })).toThrow(SyntaxError);
  });
});

describe("listAudit", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds the query string from the set options only", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, entries: [], nextBefore: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await listAudit({ limit: 50, before: 12, app: "web" });
    await listAudit();
    const urls = fetchMock.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(urls).toEqual(["/api/audit?limit=50&before=12&app=web", "/api/audit"]);
  });
});
