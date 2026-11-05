import type { FastifyPluginAsync } from "fastify";
import { isValidAppName } from "../../k8s/names.js";
import { getApp } from "../../k8s/app-lookup.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import type { DatabaseSync } from "node:sqlite";
import { getAppSource } from "../../db/app-sources.js";
import { getPendingCreateApp } from "./pending-app.js";
import { appSchema, errorSchema } from "../apps-schemas.js";

type GetAppRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
  db?: DatabaseSync;
};

/** GET /apps/:name — retrieve a single Pier-managed app by name. */
export function getAppRoutesWithDeps(deps: GetAppRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Params: { name: string } }>(
      "/apps/:name",
      {
        schema: {
          params: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
          },
          response: {
            200: appSchema,
            400: errorSchema,
            404: errorSchema,
            503: errorSchema,
          },
        },
      },
      async (req, reply) => {
        if (!deps.k8s.ok) {
          return reply.status(503).send({
            ok: false,
            error: "cluster unreachable",
          });
        }

        const name = req.params.name;

        // Validate name format.
        if (!isValidAppName(name)) {
          return reply.status(400).send({
            ok: false,
            error: "invalid request",
          });
        }

        try {
          const appData = await getApp(
            deps.k8s.clients,
            deps.namespace,
            name,
          );

          if (!appData) {
            const pending = deps.db ? getPendingCreateApp(deps.db, name) : undefined;
            if (pending) return pending;
            return reply.status(404).send({
              ok: false,
              error: "app not found",
            });
          }

          const source = deps.db ? getAppSource(deps.db, name) : undefined;
          if (!source) return appData;
          return {
            ...appData,
            source: {
              repo: source.repo,
              branch: source.branch,
              folder: source.folder,
              dockerfile: source.dockerfile,
              ...(source.gitCredential ? { gitCredential: source.gitCredential } : {}),
              lastCommit: source.lastCommit,
              lastImage: source.lastImage,
            },
          };
        } catch (err) {
          req.log.error({ err }, "get app failed");
          return reply.status(503).send({
            ok: false,
            error: "cluster unreachable",
          });
        }
      },
    );
  };
}
