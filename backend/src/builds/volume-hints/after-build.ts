import type { CoreV1Api } from "@kubernetes/client-node";
import { inspectImage } from "../../images/inspect.js";
import { getGitCredential } from "../../k8s/git-credentials/secrets.js";
import type { SourceDeployDeps } from "../deploy.js";
import { probeGitRepo } from "../git-probe.js";
import { cloneUrl } from "../source.js";
import { combineHints, imageVolumeHints } from "./index.js";

/**
 * Volume hints once a build has pushed its image (#83): the repo's own signals, re-read
 * at the built branch, plus the image's VOLUME lines from the build registry. Either half
 * failing just drops that half; hints never block a deploy.
 */
export function createBuildHints(deps: {
  core: CoreV1Api;
  /** Build namespace, where git credentials live. */
  namespace: string;
  log: { warn: (obj: object, msg: string) => void };
  fetcher?: typeof fetch;
  /** Swapped in tests. */
  probe?: typeof probeGitRepo;
}): NonNullable<SourceDeployDeps["volumeHints"]> {
  return async ({ app, source, pushImage }) => {
    const credential = source.gitCredential ? await getGitCredential(deps.core, deps.namespace, source.gitCredential).catch(() => undefined) : undefined;
    const [repo, image] = await Promise.all([
      (deps.probe ?? probeGitRepo)(cloneUrl(source.repo), {
        branch: source.branch,
        hintsFor: { folder: source.folder, method: source.method, dockerfile: source.dockerfile },
        ...(credential ? { auth: { username: credential.username, token: credential.token } } : {}),
      })
        .then((r) => r.volumeHints)
        .catch((err: unknown) => {
          deps.log.warn({ err, app }, "repo volume hints failed");
          return [];
        }),
      inspectImage(pushImage, undefined, deps.fetcher, true)
        .then(imageVolumeHints)
        .catch((err: unknown) => {
          deps.log.warn({ err, app }, "image volume hints failed");
          return undefined;
        }),
    ]);
    return combineHints(repo, image);
  };
}
