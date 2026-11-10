import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { appsUsingCredential } from "../db/app-sources.js";
import { apiStatusCode } from "../k8s/api-errors.js";
import type { K8sClientsResult } from "../k8s/clients.js";
import {
  deleteGitCredential,
  getGitCredential,
  listGitCredentials,
  replaceGitCredential,
  saveGitCredential,
  summarizeGitCredential,
} from "../k8s/git-credentials/secrets.js";

/** namespace is the build namespace (pier-system): build Jobs read the Secrets there. */
type Deps = { k8s: K8sClientsResult; namespace: string; db: DatabaseSync };
type CreateBody = { name: string; username: string; token: string };
type UpdateBody = { username?: string; token?: string };

const name = { type: "string", pattern: "^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$" } as const;
const username = { type: "string", minLength: 1, maxLength: 255 } as const;
const token = { type: "string", minLength: 1, maxLength: 4096 } as const;
const summary = {
  type: "object", additionalProperties: false, required: ["name", "username", "createdAt"],
  properties: { name, username: { type: "string" }, createdAt: { type: "string" } },
} as const;
const error = {
  type: "object", additionalProperties: false, required: ["ok", "error"],
  properties: { ok: { type: "boolean" }, error: { type: "string" }, apps: { type: "array", items: { type: "string" } } },
} as const;
const one = { type: "object", required: ["ok", "credential"], properties: { ok: { type: "boolean" }, credential: summary } } as const;

/**
 * Map Kubernetes refusals to a clear 502 (missing RBAC or namespace means the build
 * manifests were not applied). Anything else is a bug and rethrows to a 500, never a
 * misleading "cluster unreachable".
 */
function clusterRefusal(reply: FastifyReply, err: unknown): FastifyReply {
  const code = apiStatusCode(err);
  if (code === 403) return reply.status(502).send({ ok: false, error: "Pier is not allowed to manage Secrets in the build namespace; apply backend/k8s/rbac-builds.yaml" });
  if (code === 404) return reply.status(502).send({ ok: false, error: "the build namespace does not exist; apply backend/k8s/namespace-system.yaml" });
  throw err;
}

export function gitCredentialsRoutesWithDeps(deps: Deps): FastifyPluginAsync {
  return async (app) => {
    app.get("/git-credentials", {
      schema: { response: { 200: { type: "object", required: ["ok", "credentials"], properties: { ok: { type: "boolean" }, credentials: { type: "array", items: summary } } }, 502: error, 503: error } },
    }, async (_req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      try {
        return reply.send({ ok: true, credentials: await listGitCredentials(deps.k8s.clients.core, deps.namespace) });
      } catch (err) {
        return clusterRefusal(reply, err);
      }
    });

    app.post<{ Body: CreateBody }>("/git-credentials", {
      schema: {
        body: { type: "object", additionalProperties: false, required: ["name", "username", "token"], properties: { name, username, token } },
        response: { 201: one, 409: error, 502: error, 503: error },
      },
    }, async (req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      const core = deps.k8s.clients.core;
      try {
        if (await getGitCredential(core, deps.namespace, req.body.name)) {
          return reply.status(409).send({ ok: false, error: "git credential already exists" });
        }
        await saveGitCredential(core, deps.namespace, req.body);
      } catch (err) {
        if (apiStatusCode(err) === 409) return reply.status(409).send({ ok: false, error: "git credential already exists" });
        return clusterRefusal(reply, err);
      }
      return reply.status(201).send({ ok: true, credential: summarizeGitCredential(req.body) });
    });

    app.patch<{ Params: { name: string }; Body: UpdateBody }>("/git-credentials/:name", {
      schema: {
        params: { type: "object", required: ["name"], properties: { name } },
        body: { type: "object", additionalProperties: false, minProperties: 1, properties: { username, token } },
        response: { 200: one, 404: error, 502: error, 503: error },
      },
    }, async (req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      const core = deps.k8s.clients.core;
      try {
        const current = await getGitCredential(core, deps.namespace, req.params.name);
        if (!current) return reply.status(404).send({ ok: false, error: "git credential not found" });
        const value = { ...current, ...req.body };
        await replaceGitCredential(core, deps.namespace, value);
        return reply.send({ ok: true, credential: summarizeGitCredential(value) });
      } catch (err) {
        return clusterRefusal(reply, err);
      }
    });

    app.delete<{ Params: { name: string } }>("/git-credentials/:name", {
      schema: {
        params: { type: "object", required: ["name"], properties: { name } },
        response: { 204: { type: "null" }, 404: error, 409: error, 502: error, 503: error },
      },
    }, async (req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      // A build source still pointing at it would fail its next Redeploy with no clue why.
      const apps = appsUsingCredential(deps.db, req.params.name);
      if (apps.length) return reply.status(409).send({ ok: false, error: "git credential in use", apps });
      const core = deps.k8s.clients.core;
      try {
        if (!(await getGitCredential(core, deps.namespace, req.params.name))) {
          return reply.status(404).send({ ok: false, error: "git credential not found" });
        }
        await deleteGitCredential(core, deps.namespace, req.params.name);
      } catch (err) {
        return clusterRefusal(reply, err);
      }
      return reply.status(204).send();
    });
  };
}
