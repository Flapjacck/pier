import type { FastifyPluginAsync } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { getDeployment, listDeployments } from "../db/deployments-read.js";
import { toDeployDetail, toDeploySummary } from "../deploys/serialize.js";
import type { DeployTracker } from "../deploys/tracker.js";
import { APP_NAME_SCHEMA_PATTERN } from "../k8s/names.js";
import { errorSchema } from "./apps-schemas.js";
import { streamDeployment } from "./apps/deploy-stream.js";
import { deployDetailSchema, deploySummarySchema } from "./deployments-schemas.js";

type DeploymentsRouteDeps = { db: DatabaseSync; tracker: DeployTracker };

type NameParams = { name: string };
type IdParams = { name: string; id: number };

export const DEPLOYS_DEFAULT_LIMIT = 20;
export const DEPLOYS_MAX_LIMIT = 50;

const nameParams = {
  type: "object",
  properties: { name: { type: "string", pattern: APP_NAME_SCHEMA_PATTERN } },
  required: ["name"],
} as const;

const idParams = {
  type: "object",
  properties: {
    name: { type: "string", pattern: APP_NAME_SCHEMA_PATTERN },
    id: { type: "integer", minimum: 1 },
  },
  required: ["name", "id"],
} as const;

const NOT_FOUND = { ok: false, error: "deployment not found" } as const;

/**
 * Deploy history (#81), read from Pier's database only, so it still works for deleted
 * apps and an unknown app simply has no deploys.
 */
export function deploymentsRoutesWithDeps(deps: DeploymentsRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Params: NameParams; Querystring: { limit: number; before?: number } }>(
      "/apps/:name/deployments",
      {
        schema: {
          params: nameParams,
          querystring: {
            type: "object",
            properties: {
              limit: { type: "integer", minimum: 1, maximum: DEPLOYS_MAX_LIMIT, default: DEPLOYS_DEFAULT_LIMIT },
              before: { type: "integer", minimum: 1 },
            },
            additionalProperties: false,
          },
          response: {
            200: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                deployments: { type: "array", items: deploySummarySchema },
                nextBefore: { type: ["integer", "null"] },
              },
              required: ["ok", "deployments", "nextBefore"],
            },
            400: errorSchema,
            401: errorSchema,
          },
        },
      },
      async (req) => {
        const page = listDeployments(deps.db, { app: req.params.name, limit: req.query.limit, before: req.query.before });
        return { ok: true, deployments: page.items.map(toDeploySummary), nextBefore: page.nextBefore };
      },
    );

    app.get<{ Params: IdParams }>(
      "/apps/:name/deployments/:id",
      {
        schema: {
          params: idParams,
          response: {
            200: {
              type: "object",
              properties: { ok: { type: "boolean" }, deployment: deployDetailSchema },
              required: ["ok", "deployment"],
            },
            400: errorSchema,
            401: errorSchema,
            404: errorSchema,
          },
        },
      },
      async (req, reply) => {
        const row = getDeployment(deps.db, req.params.id);
        if (!row || row.app !== req.params.name) return reply.status(404).send(NOT_FOUND);
        return { ok: true, deployment: toDeployDetail(row) };
      },
    );

    app.get<{ Params: IdParams }>(
      "/apps/:name/deployments/:id/stream",
      { schema: { params: idParams, response: { 400: errorSchema, 401: errorSchema, 404: errorSchema } } },
      async (req, reply) => {
        const row = getDeployment(deps.db, req.params.id);
        if (!row || row.app !== req.params.name) return reply.status(404).send(NOT_FOUND);
        streamDeployment({ reply, req, db: deps.db, tracker: deps.tracker, id: row.id });
      },
    );
  };
}
