import type { FastifyPluginAsync } from "fastify";
import type { K8sClientsResult } from "../k8s/clients.js";
import {
  deleteRegistry,
  getRegistry,
  listRegistries,
  normalizeRegistryHost,
  registryInUse,
  replaceRegistry,
  saveRegistry,
  type RegistryCredential,
  type RegistrySummary,
} from "../k8s/registries.js";

type RegistryDeps = { k8s: K8sClientsResult; namespace: string };
type CreateBody = { name: string; host: string; username: string; password: string };
type UpdateBody = { host?: string; username?: string; password?: string };
const name = { type: "string", pattern: "^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$" } as const;
const summary = {
  type: "object", additionalProperties: false, required: ["name", "host", "username", "createdAt"],
  properties: { name, host: { type: "string" }, username: { type: "string" }, createdAt: { type: "string" } },
} as const;
const error = {
  type: "object", additionalProperties: false, required: ["ok", "error"],
  properties: { ok: { type: "boolean" }, error: { type: "string" }, apps: { type: "array", items: { type: "string" } } },
} as const;
const body = {
  type: "object", additionalProperties: false, required: ["name", "host", "username", "password"],
  properties: { name, host: { type: "string", minLength: 1, maxLength: 255 }, username: { type: "string", minLength: 1, maxLength: 255 }, password: { type: "string", minLength: 1, maxLength: 4096 } },
} as const;

function summaryOf(value: RegistryCredential, createdAt = new Date().toISOString()): RegistrySummary {
  return { name: value.name, host: normalizeRegistryHost(value.host ?? value.registry ?? ""), username: value.username, createdAt };
}

async function testConnection(value: RegistryCredential): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`https://${normalizeRegistryHost(value.host ?? value.registry ?? "")}/v2/`, {
      headers: { authorization: `Basic ${Buffer.from(`${value.username}:${value.password}`).toString("base64")}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("registry unreachable");
  }
  if (response.status === 401 || response.status === 403) throw new Error("invalid credentials");
  if (!response.ok) throw new Error("registry unreachable");
}

export function registriesRoutesWithDeps(deps: RegistryDeps): FastifyPluginAsync {
  return async (app) => {
    app.get("/registries", { schema: { response: { 200: { type: "object", required: ["ok", "registries"], properties: { ok: { type: "boolean" }, registries: { type: "array", items: summary } } }, 503: error } } }, async (_req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      return reply.send({ ok: true, registries: await listRegistries(deps.k8s.clients.core, deps.namespace) });
    });
    app.get<{ Params: { name: string } }>("/registries/:name", { schema: { response: { 200: { type: "object", required: ["ok", "registry"], properties: { ok: { type: "boolean" }, registry: summary } }, 404: error, 503: error } } }, async (req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      const value = await getRegistry(deps.k8s.clients.core, deps.namespace, req.params.name);
      if (!value) return reply.status(404).send({ ok: false, error: "registry not found" });
      return reply.send({ ok: true, registry: summaryOf(value) });
    });
    app.post<{ Body: CreateBody }>("/registries", { schema: { body, response: { 201: { type: "object", required: ["ok", "registry"], properties: { ok: { type: "boolean" }, registry: summary } }, 400: error, 409: error, 503: error } } }, async (req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      const value = { ...req.body, host: normalizeRegistryHost(req.body.host) };
      if (await getRegistry(deps.k8s.clients.core, deps.namespace, value.name)) return reply.status(409).send({ ok: false, error: "registry already exists" });
      try {
        await saveRegistry(deps.k8s.clients.core, deps.namespace, value);
        return reply.status(201).send({ ok: true, registry: summaryOf(value) });
      } catch {
        return reply.status(400).send({ ok: false, error: "could not save registry" });
      }
    });
    app.patch<{ Params: { name: string }; Body: UpdateBody }>("/registries/:name", { schema: { body: { type: "object", additionalProperties: false, minProperties: 1, properties: { host: { type: "string", minLength: 1, maxLength: 255 }, username: { type: "string", minLength: 1, maxLength: 255 }, password: { type: "string", minLength: 1, maxLength: 4096 } } }, response: { 200: { type: "object", required: ["ok", "registry"], properties: { ok: { type: "boolean" }, registry: summary } }, 404: error, 503: error } } }, async (req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      const current = await getRegistry(deps.k8s.clients.core, deps.namespace, req.params.name);
      if (!current) return reply.status(404).send({ ok: false, error: "registry not found" });
      const value = { ...current, ...req.body, host: normalizeRegistryHost(req.body.host ?? current.host ?? current.registry ?? "") };
      try {
        await replaceRegistry(deps.k8s.clients.core, deps.namespace, value);
        return reply.send({ ok: true, registry: summaryOf(value) });
      } catch {
        return reply.status(400).send({ ok: false, error: "could not update registry" });
      }
    });
    app.post<{ Params: { name: string } }>("/registries/:name/test", { schema: { response: { 200: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } }, 400: error, 404: error, 502: error, 503: error } } }, async (req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      const value = await getRegistry(deps.k8s.clients.core, deps.namespace, req.params.name);
      if (!value) return reply.status(404).send({ ok: false, error: "registry not found" });
      try {
        await testConnection(value);
        return reply.send({ ok: true });
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "registry unreachable";
        return reply.status(message === "invalid credentials" ? 400 : 502).send({ ok: false, error: message });
      }
    });
    app.delete<{ Params: { name: string } }>("/registries/:name", { schema: { response: { 204: { type: "null" }, 404: error, 409: error, 503: error } } }, async (req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      const current = await getRegistry(deps.k8s.clients.core, deps.namespace, req.params.name);
      if (!current) return reply.status(404).send({ ok: false, error: "registry not found" });
      const apps = await registryInUse(deps.k8s.clients.apps, deps.namespace, req.params.name);
      if (apps.length) return reply.status(409).send({ ok: false, error: "registry in use", apps });
      await deleteRegistry(deps.k8s.clients.core, deps.namespace, req.params.name);
      return reply.status(204).send();
    });
  };
}
