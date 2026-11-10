/**
 * Build settings (#83), parsed from the environment. Kept apart from config.ts so the
 * pinned build images live in one place and are bumped deliberately (see Renovate/
 * Dependabot notes in k8s/README.md#builds).
 */

export type BuildConfig = {
  /** host:port written into app Deployments; the node pulls it (PIER_BUILD_REGISTRY). */
  registry: string;
  /** host:port build Jobs push to, reachable inside the cluster (PIER_BUILD_PUSH_REGISTRY). */
  pushRegistry: string;
  /** Namespace for build Jobs and git credential Secrets (PIER_BUILD_NAMESPACE). */
  namespace: string;
  /** buildctl --addr for the BuildKit daemon (PIER_BUILDKIT_ADDR). */
  buildkitAddr: string;
  /** A build still running after this many seconds is killed (PIER_BUILD_TIMEOUT_SECONDS). */
  timeoutSeconds: number;
  images: BuildImages;
  railpack: RailpackPin;
};

/** Pinned images for the build Job's containers. */
export type BuildImages = {
  /** Clones the repo (alpine/git). */
  git: string;
  /** Downloads and checksums the Railpack CLI (curlimages/curl). */
  fetch: string;
  /** Runs buildctl against the daemon (moby/buildkit ships the client). */
  buildctl: string;
};

/** Railpack CLI (for `prepare`) and the matching BuildKit frontend image. */
export type RailpackPin = {
  version: string;
  frontend: string;
  /** sha256 of railpack-v<version>-<arch>-unknown-linux-musl.tar.gz from the release's checksums.txt. */
  sha256: { x86_64: string; arm64: string };
};

export const DEFAULT_BUILD_IMAGES: BuildImages = {
  git: "alpine/git:v2.54.0",
  fetch: "curlimages/curl:8.17.0",
  buildctl: "moby/buildkit:v0.34.2",
};

export const DEFAULT_RAILPACK: RailpackPin = {
  version: "0.43.0",
  frontend: "ghcr.io/railwayapp/railpack-frontend:v0.43.0",
  sha256: {
    x86_64: "248a8f60f36854aabed6124113631078a802de3461660855fc4de9c26065c1fb",
    arm64: "732ece14eb4f4676a43ebba19431f954edf7b130acb76159ef0f2ff86ac42ac9",
  },
};

const HOST_PORT = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?:[1-9][0-9]{0,4}$/;
const DNS_LABEL = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

function hostPort(name: string, raw: string | undefined, fallback: string): string {
  const value = (raw?.trim() || fallback).toLowerCase();
  const port = Number(value.split(":").pop());
  if (!HOST_PORT.test(value) || port > 65535) {
    throw new Error(`Invalid ${name} "${raw}": must be host:port (e.g. ${fallback})`);
  }
  return value;
}

function timeout(raw: string | undefined): number {
  const value = raw?.trim() ?? "";
  if (value === "") return 900;
  const seconds = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 3600) {
    throw new Error(`Invalid PIER_BUILD_TIMEOUT_SECONDS "${raw}": must be an integer between 60 and 3600`);
  }
  return seconds;
}

function buildkitAddr(raw: string | undefined): string {
  const value = raw?.trim() || "tcp://buildkitd.pier-buildkit.svc.cluster.local:1234";
  if (!/^tcp:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?:[1-9][0-9]{0,4}$/.test(value)) {
    throw new Error(`Invalid PIER_BUILDKIT_ADDR "${raw}": must be tcp://host:port`);
  }
  return value;
}

export function loadBuildConfig(env: NodeJS.ProcessEnv): BuildConfig {
  const namespace = env.PIER_BUILD_NAMESPACE?.trim() || "pier-system";
  if (!DNS_LABEL.test(namespace)) {
    throw new Error(`Invalid PIER_BUILD_NAMESPACE "${namespace}": must be a DNS-1123 label`);
  }
  return {
    registry: hostPort("PIER_BUILD_REGISTRY", env.PIER_BUILD_REGISTRY, "localhost:30500"),
    pushRegistry: hostPort(
      "PIER_BUILD_PUSH_REGISTRY",
      env.PIER_BUILD_PUSH_REGISTRY,
      `registry.${namespace}.svc.cluster.local:5000`,
    ),
    namespace,
    buildkitAddr: buildkitAddr(env.PIER_BUILDKIT_ADDR),
    timeoutSeconds: timeout(env.PIER_BUILD_TIMEOUT_SECONDS),
    images: DEFAULT_BUILD_IMAGES,
    railpack: DEFAULT_RAILPACK,
  };
}
