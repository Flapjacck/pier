import type { DatabaseSync } from "node:sqlite";
import type { FastifyBaseLogger } from "fastify";
import type { BuildConfig } from "../config-builds.js";
import { clearPendingCreate, getAppSource, setBuildResult } from "../db/app-sources.js";
import type { DeployHandle } from "../deploys/tracker.js";
import type { DeploySpec } from "../deploys/types.js";
import type { K8sClients } from "../k8s/clients.js";
import { createAppSerialized } from "../k8s/create-app.js";
import { getGitCredential } from "../k8s/git-credentials/secrets.js";
import { updateApp } from "../k8s/update-app.js";
import { applyFailureReason, specFromApp } from "../routes/apps/deploy-hooks.js";
import { runBuild as defaultRunBuild, type BuildResult, type RunBuildInput } from "./run.js";
import type { BuildSource, VolumeHint } from "./types.js";

/**
 * One build deploy from start to finish (#83): check the git credential, build the image,
 * then create the app from the saved pending settings (first deploy) or point the live
 * app at the new image (Redeploy). Runs in the background after the request returned,
 * so every outcome lands on the deploy record; nothing here throws.
 */

export type SourceDeployDeps = {
  clients: K8sClients;
  db: DatabaseSync;
  /** Namespace the apps run in (pier-apps). */
  namespace: string;
  config: BuildConfig;
  tlsIssuer?: string;
  log: Pick<FastifyBaseLogger, "warn" | "error">;
  /** Suggested volumes for the built image and repo (#83 items 21–23); none when unset. */
  volumeHints?: (input: { app: string; source: BuildSource; image: string; pushImage: string }) => Promise<VolumeHint[]>;
  /** Swapped in tests. */
  runBuild?: (clients: Required<Pick<K8sClients, "batch" | "core">>, input: RunBuildInput) => Promise<BuildResult>;
  now?: () => number;
};

/** The spec a build deploy records: the source (never a token) plus the built image. */
export function sourceSpec(spec: DeploySpec, source: BuildSource, extra: { image?: string; commit?: string | null } = {}): DeploySpec {
  return {
    ...spec,
    ...(extra.image ? { image: extra.image } : {}),
    source: {
      method: source.method,
      repo: source.repo,
      branch: source.branch,
      folder: source.folder,
      ...(source.method === "dockerfile" ? { dockerfile: source.dockerfile } : {}),
      ...(source.gitCredential ? { gitCredential: source.gitCredential } : {}),
      ...(extra.commit ? { commit: extra.commit } : {}),
    },
  };
}

async function credentialMissing(deps: SourceDeployDeps, source: BuildSource): Promise<string | null> {
  if (!source.gitCredential) return null;
  try {
    const found = await getGitCredential(deps.clients.core, deps.config.namespace, source.gitCredential);
    return found ? null : `The git credential "${source.gitCredential}" no longer exists. Add it again under Settings.`;
  } catch {
    // The build pod reports an unreadable Secret precisely; don't fail on a read blip here.
    return null;
  }
}

export async function runSourceDeploy(
  deps: SourceDeployDeps,
  input: { app: string; source: BuildSource; deploy: DeployHandle; spec: DeploySpec },
): Promise<void> {
  const { app, source, deploy } = input;
  const now = deps.now ?? Date.now;
  // Which step an unexpected throw belongs to, so the failure lands on the right row.
  let stage: "validate" | "build" | "apply" = "validate";
  try {
    const missing = await credentialMissing(deps, source);
    if (missing) return deploy.fail("validate", missing);
    if (!deps.clients.batch) return deploy.fail("validate", "Builds are not available: the backend has no batch API client.");
    deploy.stepSucceeded("validate");
    deploy.stepStarted("build");
    stage = "build";

    const run = deps.runBuild ?? defaultRunBuild;
    const result = await run({ batch: deps.clients.batch, core: deps.clients.core }, { app, source, config: deps.config, handle: deploy });
    if (!result.ok) {
      if (!result.cancelled) deploy.fail("build", result.reason);
      return;
    }
    const pushImage = result.image.replace(deps.config.registry, deps.config.pushRegistry);
    deploy.line("build", "info", `Pushed ${pushImage}`);
    deploy.stepSucceeded("build");
    const spec = sourceSpec(input.spec, source, { image: result.image, commit: result.commit });
    deploy.updateSpec(spec);

    const hints = await deps.volumeHints?.({ app, source, image: result.image, pushImage }).catch((err: unknown) => {
      deps.log.warn({ err, app }, "volume hints failed");
      return [];
    });
    setBuildResult(deps.db, app, { commit: result.commit, image: result.image, volumeHints: hints ?? [], now: now() });
    // Shown on the deploy page so a Redeploy surfaces new suggestions; attached volumes are untouched.
    for (const hint of hints ?? []) deploy.line("build", "info", `Suggested volume ${hint.path} (${hint.confidence}): ${hint.reason}`);
    // Deleted (or superseded) while building: don't resurrect the app.
    if (!deploy.isRunning()) return;
    stage = "apply";
    await apply(deps, { app, source, deploy, image: result.image, commit: result.commit });
  } catch (err) {
    deps.log.error({ err, app, deploymentId: deploy.id }, "build deploy failed");
    if (deploy.isRunning()) deploy.fail(stage, "Pier hit an unexpected error during the deploy. Check the backend logs.");
  }
}

async function apply(
  deps: SourceDeployDeps,
  input: { app: string; source: BuildSource; deploy: DeployHandle; image: string; commit: string | null },
): Promise<void> {
  const { app, source, deploy, image, commit } = input;
  const pending = getAppSource(deps.db, app)?.pendingCreate;
  try {
    const live = pending
      ? await createAppSerialized(deps.clients, deps.namespace, { name: app, image, ...pending, tlsIssuer: deps.tlsIssuer }, deps.log)
      : await updateApp(deps.clients, deps.namespace, app, { image }, deps.log);
    // Forget env values as soon as they live in the Deployment.
    if (pending) clearPendingCreate(deps.db, app, (deps.now ?? Date.now)());
    deploy.applied(sourceSpec(specFromApp(live), source, { image, commit }));
  } catch (err) {
    deps.log.error({ err, app, deploymentId: deploy.id }, "apply after build failed");
    deploy.fail("apply", applyFailureReason(err));
  }
}
