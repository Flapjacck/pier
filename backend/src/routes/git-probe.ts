import type { FastifyPluginAsync } from "fastify";
import type { K8sClientsResult } from "../k8s/clients.js";
import { getGitCredential } from "../k8s/git-credentials/secrets.js";
import { GitProbeError, probeGitRepo } from "../k8s/git-probe/probe.js";

type Deps = { k8s: K8sClientsResult; namespace: string };

const bodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["repo"],
  properties: {
    repo: { type: "string", minLength: 1, maxLength: 512 },
    gitCredential: { type: "string", minLength: 1, maxLength: 63 },
  },
} as const;

const resultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["defaultBranch", "branches", "folders"],
  properties: {
    defaultBranch: { type: "string" },
    branches: { type: "array", items: { type: "string" } },
    folders: { type: "array", items: { type: "string" } },
  },
} as const;

const errorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "error"],
  properties: { ok: { type: "boolean" }, error: { type: "string" }, details: { type: "string" } },
} as const;

/** POST /git/probe — list branches and folders for the deploy wizard (#83). */
export function gitProbeRoutesWithDeps(deps: Deps): FastifyPluginAsync {
  return async (app) => {
    app.post<{ Body: { repo: string; gitCredential?: string } }>(
      "/git/probe",
      {
        schema: {
          body: bodySchema,
          response: {
            200: resultSchema,
            400: errorSchema,
            404: errorSchema,
            502: errorSchema,
            503: errorSchema,
          },
        },
      },
      async (req, reply) => {
        if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
        let auth: { username: string; token: string } | undefined;
        if (req.body.gitCredential) {
          const cred = await getGitCredential(deps.k8s.clients.core, deps.namespace, req.body.gitCredential);
          if (!cred) return reply.status(404).send({ ok: false, error: "git credential not found" });
          auth = { username: cred.username, token: cred.token };
        }
        try {
          return await probeGitRepo(req.body.repo, auth);
        } catch (err) {
          if (err instanceof GitProbeError) {
            return reply.status(err.status).send({ ok: false, error: err.message });
          }
          req.log.error({ err }, "git probe failed");
          return reply.status(502).send({ ok: false, error: "Could not probe repository" });
        }
      },
    );
  };
}
