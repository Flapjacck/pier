import type { FastifyPluginAsync } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import type { K8sClientsResult } from "../k8s/clients.js";
import {
  deleteGitCredential,
  getGitCredential,
  listGitCredentials,
  replaceGitCredential,
  saveGitCredential,
  type GitCredential,
  type GitCredentialSummary,
} from "../k8s/git-credentials/secrets.js";

type Deps = { k8s: K8sClientsResult; namespace: string; db?: DatabaseSync };
type CreateBody = { name: string; username: string; token: string };
type UpdateBody = { username?: string; token?: string };

const name = { type: "string", pattern: "^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$" } as const;
const summary = {
  type: "object",
  additionalProperties: false,
  required: ["name", "username", "createdAt"],
  properties: { name, username: { type: "string" }, createdAt: { type: "string" } },
} as const;
const error = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "error"],
  properties: { ok: { type: "boolean" }, error: { type: "string" }, apps: { type: "array", items: { type: "string" } } },
} as const;

function summaryOf(value: GitCredential): GitCredentialSummary {
  return { name: value.name, username: value.username, createdAt: value.createdAt ?? new Date().toISOString() };
}

function appsUsingCredential(db: DatabaseSync | undefined, cred: string): string[] {
  if (!db) return [];
  const rows = db.prepare("SELECT app FROM app_sources WHERE git_credential = ?").all(cred);
  return rows.map((r) => String((r as { app: string }).app));
}

export function gitCredentialsRoutesWithDeps(deps: Deps): FastifyPluginAsync {
  return async (app) => {
    app.get("/git-credentials", {
      schema: {
        response: {
          200: { type: "object", required: ["ok", "credentials"], properties: { ok: { type: "boolean" }, credentials: { type: "array", items: summary } } },
          503: error,
        },
      },
    }, async (_req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      return reply.send({ ok: true, credentials: await listGitCredentials(deps.k8s.clients.core, deps.namespace) });
    });

    app.post<{ Body: CreateBody }>("/git-credentials", {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["name", "username", "token"],
          properties: {
            name,
            username: { type: "string", minLength: 1, maxLength: 255 },
            token: { type: "string", minLength: 1, maxLength: 4096 },
          },
        },
        response: {
          201: { type: "object", required: ["ok", "credential"], properties: { ok: { type: "boolean" }, credential: summary } },
          409: error,
          400: error,
          503: error,
        },
      },
    }, async (req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      if (await getGitCredential(deps.k8s.clients.core, deps.namespace, req.body.name)) {
        return reply.status(409).send({ ok: false, error: "git credential already exists" });
      }
      try {
        await saveGitCredential(deps.k8s.clients.core, deps.namespace, req.body);
        return reply.status(201).send({ ok: true, credential: summaryOf(req.body) });
      } catch {
        return reply.status(400).send({ ok: false, error: "could not save git credential" });
      }
    });

    app.patch<{ Params: { name: string }; Body: UpdateBody }>("/git-credentials/:name", {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: {
            username: { type: "string", minLength: 1, maxLength: 255 },
            token: { type: "string", minLength: 1, maxLength: 4096 },
          },
        },
        response: {
          200: { type: "object", required: ["ok", "credential"], properties: { ok: { type: "boolean" }, credential: summary } },
          404: error,
          400: error,
          503: error,
        },
      },
    }, async (req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      const current = await getGitCredential(deps.k8s.clients.core, deps.namespace, req.params.name);
      if (!current) return reply.status(404).send({ ok: false, error: "git credential not found" });
      const value = { ...current, ...req.body };
      try {
        await replaceGitCredential(deps.k8s.clients.core, deps.namespace, value);
        return reply.send({ ok: true, credential: summaryOf(value) });
      } catch {
        return reply.status(400).send({ ok: false, error: "could not update git credential" });
      }
    });

    app.delete<{ Params: { name: string } }>("/git-credentials/:name", {
      schema: {
        response: { 204: { type: "null" }, 404: error, 409: error, 503: error },
      },
    }, async (req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      const current = await getGitCredential(deps.k8s.clients.core, deps.namespace, req.params.name);
      if (!current) return reply.status(404).send({ ok: false, error: "git credential not found" });
      const apps = appsUsingCredential(deps.db, req.params.name);
      if (apps.length) return reply.status(409).send({ ok: false, error: "git credential in use", apps });
      await deleteGitCredential(deps.k8s.clients.core, deps.namespace, req.params.name);
      return reply.status(204).send();
    });
  };
}
