import type { DatabaseSync } from "node:sqlite";
import type { FastifyBaseLogger } from "fastify";
import { upsertAppSource } from "../../db/app-sources.js";
import { appendLog, setStepStatus } from "../../db/deployments.js";
import type { DeployHandle } from "../../deploys/tracker.js";
import type { DeploySpec } from "../../deploys/types.js";
import { builtImageRef, normalizeBuildSource, type BuildSource } from "../../k8s/builds/source.js";
import { BuildFailedError, runBuildJob } from "../../k8s/builds/run.js";
import { getGitCredential } from "../../k8s/git-credentials/secrets.js";
import type { K8sClients } from "../../k8s/clients.js";
import { inspectImage } from "../../images/inspect.js";

export type BuildConfig = {
  buildRegistry: string;
  buildPushRegistry: string;
  buildNamespace: string;
  buildTimeoutSeconds: number;
  kanikoImage: string;
};

/**
 * Mark Validate done, run Kaniko, stream logs into the Build image step, upsert
 * app_sources. Returns the image ref to deploy. On failure the deploy is failed.
 */
export async function buildImageForDeploy(opts: {
  clients: K8sClients;
  db: DatabaseSync;
  deploy: DeployHandle;
  app: string;
  source: BuildSource;
  build: BuildConfig;
  log: FastifyBaseLogger;
  now?: () => number;
}): Promise<{ image: string; source: BuildSource; tag: string }> {
  const now = opts.now ?? Date.now;
  const at = now();
  const { deploy, db, app, source, build, clients } = opts;

  if (source.gitCredential) {
    const cred = await getGitCredential(clients.core, build.buildNamespace, source.gitCredential);
    if (!cred) {
      deploy.fail("validate", "git credential not found");
      throw new BuildFailedError("git credential not found");
    }
  }

  setStepStatus(db, deploy.id, "validate", "succeeded", at);
  setStepStatus(db, deploy.id, "build", "running", at);
  appendLog(db, {
    deploymentId: deploy.id,
    step: "build",
    level: "info",
    text: `Building ${source.repo} (branch ${source.branch}, folder ${source.folder}, dockerfile ${source.dockerfile})`,
    ts: at,
  });

  const tag = `d${deploy.id}`;
  // Pull ref for Deployments (NodePort / registries.yaml); push ref for Kaniko (cluster DNS).
  const image = builtImageRef(build.buildRegistry, app, tag);
  const pushDestination = builtImageRef(build.buildPushRegistry, app, tag);

  try {
    await runBuildJob({
      batch: clients.batch,
      core: clients.core,
      app,
      deployId: deploy.id,
      source,
      destination: pushDestination,
      namespace: build.buildNamespace,
      kanikoImage: build.kanikoImage,
      timeoutSeconds: build.buildTimeoutSeconds,
      onLog: (lines) => {
        const ts = now();
        for (const text of lines) {
          appendLog(db, { deploymentId: deploy.id, step: "build", level: "info", text, ts });
        }
      },
    });
  } catch (err) {
    const message = err instanceof BuildFailedError ? err.message : "The image build failed.";
    opts.log.error({ err, app, deploymentId: deploy.id }, "build failed");
    deploy.fail("build", message);
    throw err instanceof BuildFailedError ? err : new BuildFailedError(message);
  }

  const done = now();
  setStepStatus(db, deploy.id, "build", "succeeded", done);
  appendLog(db, {
    deploymentId: deploy.id,
    step: "build",
    level: "info",
    text: `Pushed ${pushDestination} (pull as ${image})`,
    ts: done,
  });

  upsertAppSource(db, {
    app,
    repo: source.repo,
    branch: source.branch,
    folder: source.folder,
    dockerfile: source.dockerfile,
    gitCredential: source.gitCredential ?? null,
    lastCommit: null,
    lastImage: image,
    updatedAt: done,
  });

  try {
    const inspection = await inspectImage(pushDestination, {
      name: "pier-build",
      host: `http://${build.buildPushRegistry}`,
      registry: build.buildPushRegistry,
      username: "",
      password: "",
    });
    if (inspection.volumes.length > 0) {
      appendLog(db, {
        deploymentId: deploy.id,
        step: "build",
        level: "info",
        text:
          `This image declares VOLUME paths: ${inspection.volumes.join(", ")}. ` +
          "Attach a Pier volume or that data will be lost when the pod restarts.",
        ts: now(),
      });
    }
  } catch (err) {
    opts.log.warn({ err, image: pushDestination }, "post-build image inspect failed");
  }

  return { image, source, tag };
}

export function sourceFromBody(raw: {
  repo: string;
  branch?: string;
  folder?: string;
  dockerfile?: string;
  gitCredential?: string;
}): BuildSource {
  return normalizeBuildSource(raw);
}

export function specWithSource(spec: DeploySpec, source: BuildSource, image: string): DeploySpec {
  return {
    ...spec,
    image,
    source: {
      repo: source.repo,
      branch: source.branch,
      folder: source.folder,
      dockerfile: source.dockerfile,
      ...(source.gitCredential ? { gitCredential: source.gitCredential } : {}),
    },
  };
}
