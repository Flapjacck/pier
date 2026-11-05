import type { DatabaseSync } from "node:sqlite";
import type { FastifyBaseLogger } from "fastify";
import type { K8sClients } from "../../k8s/clients.js";
import { createAppSerialized } from "../../k8s/create-app.js";
import { updateApp } from "../../k8s/update-app.js";
import type { DeployHandle } from "../../deploys/tracker.js";
import type { BuildSource } from "../../k8s/builds/source.js";
import { BuildFailedError } from "../../k8s/builds/run.js";
import {
  buildImageForDeploy,
  specWithSource,
  type BuildConfig,
} from "./build-deploy.js";
import { recordDeployError, specFromApp } from "./deploy-hooks.js";
import type { PostAppsBody } from "../apps-schemas.js";

type CreateInput = {
  clients: K8sClients;
  namespace: string;
  db: DatabaseSync;
  build: BuildConfig;
  deploy: DeployHandle;
  name: string;
  source: BuildSource;
  body: PostAppsBody;
  hostNorm: string | undefined;
  tlsIssuer?: string;
  log: FastifyBaseLogger;
};

/** Build then create the app. Runs after the HTTP response so Build logs stream live. */
export function scheduleCreateFromSource(input: CreateInput): void {
  void runCreateFromSource(input).catch((err) => {
    input.log.error({ err, app: input.name, deploymentId: input.deploy.id }, "background create-from-source failed");
  });
}

async function runCreateFromSource(input: CreateInput): Promise<void> {
  const { clients, namespace, db, build, deploy, name, source, body, hostNorm, tlsIssuer, log } = input;
  try {
    const built = await buildImageForDeploy({
      clients,
      db,
      deploy,
      app: name,
      source,
      build,
      log,
    });
    const appResult = await createAppSerialized(
      clients,
      namespace,
      {
        name,
        image: built.image,
        port: body.port,
        replicas: body.replicas,
        host: hostNorm,
        env: body.env,
        resources: body.resources,
        tlsIssuer,
        volumes: body.volumes,
      },
      log,
    );
    deploy.applied(specWithSource(specFromApp(appResult), source, built.image));
  } catch (err) {
    log.error({ err, app: name, deploymentId: deploy.id }, "create-from-source pipeline failed");
    if (!(err instanceof BuildFailedError)) recordDeployError(deploy, err);
  }
}

type RedeployInput = {
  clients: K8sClients;
  namespace: string;
  db: DatabaseSync;
  build: BuildConfig;
  deploy: DeployHandle;
  name: string;
  source: BuildSource;
  log: FastifyBaseLogger;
};

/** Rebuild then roll out. Runs after the HTTP response so Build logs stream live. */
export function scheduleRedeployFromSource(input: RedeployInput): void {
  void runRedeployFromSource(input).catch((err) => {
    input.log.error({ err, app: input.name, deploymentId: input.deploy.id }, "background redeploy failed");
  });
}

async function runRedeployFromSource(input: RedeployInput): Promise<void> {
  const { clients, namespace, db, build, deploy, name, source, log } = input;
  try {
    const built = await buildImageForDeploy({
      clients,
      db,
      deploy,
      app: name,
      source,
      build,
      log,
    });
    const appResult = await updateApp(clients, namespace, name, { image: built.image }, log);
    deploy.applied(specWithSource(specFromApp(appResult), source, built.image));
  } catch (err) {
    log.error({ err, app: name, deploymentId: deploy.id }, "redeploy pipeline failed");
    if (!(err instanceof BuildFailedError)) recordDeployError(deploy, err);
  }
}
