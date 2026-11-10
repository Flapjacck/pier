import type { FastifyPluginAsync } from "fastify";
import { GitProbeError, probeGitRepo, type GitAuth } from "../builds/git-probe.js";
import { cloneUrl, InvalidBuildSourceError, normalizeBuildSource } from "../builds/source.js";
import type { K8sClientsResult } from "../k8s/clients.js";
import { getGitCredential } from "../k8s/git-credentials/secrets.js";
import { APP_NAME_SCHEMA_PATTERN } from "../k8s/names.js";
import { errorSchema } from "./apps-schemas.js";

type Deps = {
  k8s: K8sClientsResult;
  /** Build namespace, where git credential Secrets live. */
  namespace: string;
  /** Swapped in tests. */
  probe?: typeof probeGitRepo;
};

type Body = { repo: string; gitCredential?: string };

const bodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["repo"],
  properties: {
    repo: { type: "string", minLength: 1, maxLength: 512 },
    gitCredential: { type: "string", minLength: 1, maxLength: 63, pattern: APP_NAME_SCHEMA_PATTERN },
  },
} as const;

const resultSchema = {
  type: "object",
  required: ["defaultBranch", "branches", "folders", "dockerfiles"],
  properties: {
    defaultBranch: { type: "string" },
    branches: { type: "array", items: { type: "string" } },
    folders: { type: "array", items: { type: "string" } },
    dockerfiles: { type: "array", items: { type: "string" } },
  },
} as const;

/**
 * POST /git/probe — branches, folders and Dockerfiles for the deploy wizard (#83).
 * Read-only, so it isn't audited; it only reads a credential the caller already picked.
 */
export function gitProbeRoutesWithDeps(deps: Deps): FastifyPluginAsync {
  const probe = deps.probe ?? probeGitRepo;
  return async (app) => {
    app.post<{ Body: Body }>(
      "/git/probe",
      { schema: { body: bodySchema, response: { 200: resultSchema, 400: errorSchema, 404: errorSchema, 502: errorSchema, 503: errorSchema } } },
      async (req, reply) => {
        let remote: string;
        try {
          remote = cloneUrl(normalizeBuildSource({ repo: req.body.repo }).repo);
        } catch (err) {
          if (err instanceof InvalidBuildSourceError) return reply.status(400).send({ ok: false, error: "invalid request", details: err.details });
          throw err;
        }

        let auth: GitAuth | undefined;
        if (req.body.gitCredential) {
          if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
          try {
            const cred = await getGitCredential(deps.k8s.clients.core, deps.namespace, req.body.gitCredential);
            if (!cred) return reply.status(404).send({ ok: false, error: "git credential not found" });
            auth = { username: cred.username, token: cred.token };
          } catch (err) {
            req.log.error({ err }, "read git credential failed");
            return reply.status(503).send({ ok: false, error: "cluster unreachable" });
          }
        }

        try {
          const result = await probe(remote, { auth });
          return { defaultBranch: result.defaultBranch, branches: result.branches, folders: result.folders, dockerfiles: result.dockerfiles };
        } catch (err) {
          if (err instanceof GitProbeError) return reply.status(err.status).send({ ok: false, error: err.message });
          req.log.error({ err }, "git probe failed");
          return reply.status(502).send({ ok: false, error: "Could not read the repository" });
        }
      },
    );
  };
}
