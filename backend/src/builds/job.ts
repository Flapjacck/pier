import type { V1Container, V1EnvVar, V1Job, V1ResourceRequirements } from "@kubernetes/client-node";
import type { BuildConfig } from "../config-builds.js";
import { GIT_TOKEN_KEY, GIT_USERNAME_KEY, gitCredentialSecretName } from "../k8s/git-credentials/secrets.js";
import { MANAGED_BY_LABEL, MANAGED_BY_VALUE } from "../k8s/labels.js";
import { BUILD_SCRIPT, CLONE_SCRIPT, FETCH_SCRIPT, PREPARE_SCRIPT } from "./job-scripts.js";
import { builtImageRef, cloneUrl } from "./source.js";
import type { BuildSource } from "./types.js";

/**
 * The build Job (#83): fetch Railpack → clone → Railpack prepare → buildctl. Init
 * containers run in order and share an emptyDir workspace; the heavy work happens in
 * the shared BuildKit daemon (warm cache), so the pod itself stays small, unprivileged,
 * has no service account token and never mounts a Docker socket.
 */

/** pod label the pier-build-egress and buildkitd-ingress NetworkPolicies select. */
export const BUILD_POD_LABEL = "app";
export const BUILD_POD_VALUE = "pier-build";
export const BUILD_APP_LABEL = "pier.build-app";
export const BUILD_DEPLOY_LABEL = "pier.deployment";
/** Finished Jobs (and their logs) stay this long for kubectl debugging, then Kubernetes deletes them. */
export const BUILD_TTL_SECONDS = 600;
/** Containers in run order; the pipeline streams each one's log into the Build step. */
export const BUILD_CONTAINERS = ["fetch", "clone", "prepare", "build"] as const;
export type BuildContainer = (typeof BUILD_CONTAINERS)[number];

export type BuildJobInput = {
  app: string;
  deploymentId: number;
  source: BuildSource;
  config: BuildConfig;
};

const WORKSPACE = { name: "workspace", mountPath: "/workspace" };

const STEP_RESOURCES: V1ResourceRequirements = {
  requests: { cpu: "50m", memory: "64Mi" },
  limits: { cpu: "1", memory: "512Mi" },
};
/** Railpack prepare reads lockfiles of big monorepos; give it more room. */
const PREPARE_RESOURCES: V1ResourceRequirements = {
  requests: { cpu: "100m", memory: "128Mi" },
  limits: { cpu: "1", memory: "1Gi" },
};

/** Job name: unique per deploy, a valid DNS label (app names are already DNS labels). */
export function buildJobName(app: string, deploymentId: number): string {
  return `pier-build-${deploymentId}-${app}`.slice(0, 63).replace(/-+$/, "");
}

/** Tag per deploy, so a rollback (#87) can point at an older build. */
export function buildTag(deploymentId: number): string {
  return `d${deploymentId}`;
}

/** Image refs for a build: push goes to the in-cluster Service, the Deployment pulls via the node. */
export function buildImageRefs(input: Pick<BuildJobInput, "app" | "deploymentId" | "config">): { push: string; pull: string } {
  const tag = buildTag(input.deploymentId);
  return {
    push: builtImageRef(input.config.pushRegistry, input.app, tag),
    pull: builtImageRef(input.config.registry, input.app, tag),
  };
}

function env(values: Record<string, string>): V1EnvVar[] {
  return Object.entries(values).map(([name, value]) => ({ name, value }));
}

function container(name: BuildContainer, image: string, script: string, vars: V1EnvVar[], resources = STEP_RESOURCES): V1Container {
  return {
    name,
    image,
    imagePullPolicy: "IfNotPresent",
    command: ["sh", "-c", script],
    env: vars,
    resources,
    volumeMounts: [WORKSPACE],
    securityContext: {
      allowPrivilegeEscalation: false,
      capabilities: { drop: ["ALL"] },
      runAsNonRoot: true,
      runAsUser: 1000,
      runAsGroup: 1000,
      seccompProfile: { type: "RuntimeDefault" },
    },
  };
}

function credentialEnv(source: BuildSource): V1EnvVar[] {
  if (!source.gitCredential) return [];
  const secret = gitCredentialSecretName(source.gitCredential);
  return [
    { name: "GIT_USERNAME", valueFrom: { secretKeyRef: { name: secret, key: GIT_USERNAME_KEY } } },
    { name: "GIT_PASSWORD", valueFrom: { secretKeyRef: { name: secret, key: GIT_TOKEN_KEY } } },
  ];
}

export function buildJob(input: BuildJobInput): V1Job {
  const { app, deploymentId, source, config } = input;
  const railpack = source.method === "railpack";
  const refs = buildImageRefs(input);
  const common = { BUILD_FOLDER: source.folder };
  const fetch = container("fetch", config.images.fetch, FETCH_SCRIPT, env({
    RAILPACK_VERSION: config.railpack.version,
    RAILPACK_SHA256_X86_64: config.railpack.sha256.x86_64,
    RAILPACK_SHA256_ARM64: config.railpack.sha256.arm64,
  }));
  const clone = container("clone", config.images.git, CLONE_SCRIPT, [
    ...env({ ...common, GIT_REPO: cloneUrl(source.repo), GIT_BRANCH: source.branch }),
    ...credentialEnv(source),
  ]);
  const prepare = container("prepare", config.images.git, PREPARE_SCRIPT, env(common), PREPARE_RESOURCES);
  const build = container("build", config.images.buildctl, BUILD_SCRIPT, env({
    ...common,
    BUILD_METHOD: source.method,
    DOCKERFILE: source.dockerfile,
    IMAGE_REF: refs.push,
    BUILDKIT_HOST: config.buildkitAddr,
    RAILPACK_FRONTEND: config.railpack.frontend,
    CACHE_KEY: app,
  }));
  const labels = {
    [BUILD_POD_LABEL]: BUILD_POD_VALUE,
    [BUILD_APP_LABEL]: app,
    [BUILD_DEPLOY_LABEL]: String(deploymentId),
    [MANAGED_BY_LABEL]: MANAGED_BY_VALUE,
  };
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name: buildJobName(app, deploymentId), namespace: config.namespace, labels },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: config.timeoutSeconds,
      ttlSecondsAfterFinished: BUILD_TTL_SECONDS,
      template: {
        metadata: { labels },
        spec: {
          restartPolicy: "Never",
          automountServiceAccountToken: false,
          enableServiceLinks: false,
          securityContext: { fsGroup: 1000, seccompProfile: { type: "RuntimeDefault" } },
          initContainers: railpack ? [fetch, clone, prepare] : [clone],
          containers: [build],
          volumes: [{ name: WORKSPACE.name, emptyDir: { sizeLimit: "4Gi" } }],
        },
      },
    },
  };
}
