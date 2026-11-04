import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { finishDeployment, insertDeployment } from "../../src/db/deployments.js";
import { openDatabase } from "../../src/db/open.js";
import { createDeployTracker, type DeployTracker } from "../../src/deploys/tracker.js";
import { deploymentsRoutesWithDeps } from "../../src/routes/deployments.js";
import { createFakeClientsResult } from "../helpers/fake-clients.js";
import { waitFor } from "../helpers/wait-for.js";

const quiet = { info: () => {}, warn: () => {}, error: () => {} };

async function serve() {
  const db = openDatabase(":memory:");
  const tracker = createDeployTracker({ db, k8s: createFakeClientsResult({}), namespace: "pier-apps", log: quiet, timeoutMs: 300_000, pollMs: 60_000 });
  // Count open subscriptions so the disconnect test can see the stream let go.
  const live = { count: 0 };
  const counted: DeployTracker = {
    ...tracker,
    subscribe: (id, listener) => {
      live.count++;
      const off = tracker.subscribe(id, listener);
      return () => {
        live.count--;
        off();
      };
    },
  };
  const app = Fastify({ logger: false });
  await app.register(deploymentsRoutesWithDeps({ db, tracker: counted }), { prefix: "/api" });
  const base = await app.listen({ port: 0, host: "127.0.0.1" });
  return { db, tracker, app, base, live };
}

type Event = { event: string; data: string };

/** Read SSE events from a response until `done` says stop or the stream ends. */
async function collect(res: Response, done: (events: Event[]) => boolean): Promise<Event[]> {
  const reader = res.body?.getReader();
  assert.ok(reader);
  const decoder = new TextDecoder();
  const events: Event[] = [];
  let buffer = "";
  while (!done(events)) {
    const { value, done: ended } = await reader.read();
    if (ended) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      if (event) events.push({ event, data: /^data: ?(.*)$/m.exec(block)?.[1] ?? "" });
    }
  }
  await reader.cancel().catch(() => {});
  return events;
}

describe("GET /api/apps/:name/deployments/:id/stream", () => {
  it("sends the current state, every change, then end when the deploy finishes", async () => {
    const { tracker, app, base, db } = await serve();
    const handle = tracker.begin("web", "patch", { image: "nginx:1.28" });
    assert.ok(handle);
    const res = await fetch(`${base}/api/apps/web/deployments/${handle.id}/stream`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
    const reading = collect(res, (events) => events.some((e) => e.event === "end"));
    // Let the first event arrive, then fail the deploy through the tracker (emits a change).
    await new Promise((r) => setTimeout(r, 50));
    handle.fail("validate", "bad resources");
    const events = await reading;
    const states = events.filter((e) => e.event === "deployment").map((e) => JSON.parse(e.data) as { status: string; reason: string | null });
    assert.equal(states[0]?.status, "running");
    assert.equal(states.at(-1)?.status, "failed");
    assert.equal(states.at(-1)?.reason, "bad resources");
    assert.equal(events.at(-1)?.event, "end");
    assert.equal(db.prepare("SELECT status FROM deployments WHERE id = ?").get(handle.id)?.status, "failed");
    tracker.stop();
    await app.close();
  });

  it("sends one state and end straight away for a finished deploy", async () => {
    const { tracker, app, base, db } = await serve();
    const id = insertDeployment(db, { app: "web", trigger: "create", spec: {}, now: Date.now() });
    finishDeployment(db, id, { status: "succeeded", reason: null, now: Date.now() });
    const res = await fetch(`${base}/api/apps/web/deployments/${id}/stream`);
    const events = await collect(res, () => false);
    assert.deepEqual(events.map((e) => e.event), ["deployment", "end"]);
    tracker.stop();
    await app.close();
  });

  it("unsubscribes when the client disconnects", async () => {
    const { tracker, app, base, live } = await serve();
    const handle = tracker.begin("web", "restart", {});
    assert.ok(handle);
    const controller = new AbortController();
    const res = await fetch(`${base}/api/apps/web/deployments/${handle.id}/stream`, { signal: controller.signal });
    await collect(res, (events) => events.length > 0);
    controller.abort();
    // Once the server sees the closed socket the stream drops its tracker listener.
    assert.equal(live.count, 1);
    await waitFor(() => live.count === 0, 2000, "stream unsubscribed");
    handle.fail("apply", "cluster down");
    tracker.stop();
    await app.close();
  });
});
