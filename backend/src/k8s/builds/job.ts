import type { V1Job } from "@kubernetes/client-node";
import { MANAGED_BY_LABEL, MANAGED_BY_VALUE } from "../labels.js";
import { gitCredentialSecretName } from "../git-credentials/secrets.js";
import { cloneRepoUrl, kanikoBuildContext, type BuildSource } from "./source.js";

export type BuildJobInput = {
  app: string;
  deployId: number;
  source: BuildSource;
  /** Full image ref including tag, e.g. localhost:30500/hello:abc1234 */
  destination: string;
  namespace: string;
  kanikoImage: string;
  timeoutSeconds: number;
};

const PART_OF = "app.kubernetes.io/part-of";
const APP_LABEL = "pier.build/app";
const DEPLOY_LABEL = "pier.build/deploy";

/** Pinned clone image for the initContainer (override later via config if needed). */
export const GIT_CLONE_IMAGE = "alpine/git:v2.47.2";

/** DNS-1123 Job name: pier-build-<app>-<id>, truncated to 63. */
export function buildJobName(app: string, deployId: number): string {
  const base = `pier-build-${app}-${deployId}`;
  return base.length <= 63 ? base : `pier-build-${deployId}`.slice(0, 63);
}

/**
 * Shell that clones into /workspace/src. HTTPS credentials go through ~/.netrc
 * so tokens with special characters stay out of the URL.
 */
function cloneScript(): string {
  return `set -eu
mkdir -p /workspace/src
REPO_URL="$REPO"
case "$REPO_URL" in
  https://*)
    if [ -n "\${GIT_USERNAME:-}" ] && [ -n "\${GIT_PASSWORD:-}" ]; then
      host="\${REPO_URL#https://}"
      host="\${host%%/*}"
      printf 'machine %s\\nlogin %s\\npassword %s\\n' "$host" "$GIT_USERNAME" "$GIT_PASSWORD" > /root/.netrc
      chmod 600 /root/.netrc
    fi
    ;;
esac
echo "Cloning $REPO_URL (branch $BRANCH)…"
git clone --depth 1 --single-branch --branch "$BRANCH" "$REPO_URL" /workspace/src
echo "Clone complete."
`;
}

export function buildJobSpec(input: BuildJobInput): V1Job {
  const name = buildJobName(input.app, input.deployId);
  const context = kanikoBuildContext(input.source);
  const args = [
    `--context=${context}`,
    `--dockerfile=${input.source.dockerfile}`,
    `--destination=${input.destination}`,
    "--insecure",
    "--insecure-pull",
    "--skip-tls-verify",
  ];

  const gitEnv: {
    name: string;
    value?: string;
    valueFrom?: { secretKeyRef: { name: string; key: string } };
  }[] = [
    { name: "REPO", value: cloneRepoUrl(input.source) },
    { name: "BRANCH", value: input.source.branch },
  ];
  if (input.source.gitCredential) {
    const secret = gitCredentialSecretName(input.source.gitCredential);
    gitEnv.push(
      { name: "GIT_USERNAME", valueFrom: { secretKeyRef: { name: secret, key: "username" } } },
      { name: "GIT_PASSWORD", valueFrom: { secretKeyRef: { name: secret, key: "token" } } },
    );
  }

  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name,
      namespace: input.namespace,
      labels: {
        [MANAGED_BY_LABEL]: MANAGED_BY_VALUE,
        [PART_OF]: "pier",
        [APP_LABEL]: input.app,
        [DEPLOY_LABEL]: String(input.deployId),
        app: "pier-build",
      },
    },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: input.timeoutSeconds,
      ttlSecondsAfterFinished: 3600,
      template: {
        metadata: {
          labels: {
            [MANAGED_BY_LABEL]: MANAGED_BY_VALUE,
            [APP_LABEL]: input.app,
            [DEPLOY_LABEL]: String(input.deployId),
            app: "pier-build",
          },
        },
        spec: {
          restartPolicy: "Never",
          automountServiceAccountToken: false,
          securityContext: {
            seccompProfile: { type: "RuntimeDefault" },
          },
          volumes: [{ name: "workspace", emptyDir: {} }],
          initContainers: [
            {
              name: "clone",
              image: GIT_CLONE_IMAGE,
              imagePullPolicy: "IfNotPresent",
              command: ["sh", "-c"],
              args: [cloneScript()],
              env: gitEnv,
              volumeMounts: [{ name: "workspace", mountPath: "/workspace" }],
              resources: {
                requests: { cpu: "50m", memory: "64Mi" },
                limits: { cpu: "500m", memory: "256Mi" },
              },
              securityContext: {
                allowPrivilegeEscalation: false,
                capabilities: { drop: ["ALL"] },
                runAsNonRoot: false,
              },
            },
          ],
          containers: [
            {
              name: "kaniko",
              image: input.kanikoImage,
              imagePullPolicy: "IfNotPresent",
              args,
              volumeMounts: [{ name: "workspace", mountPath: "/workspace" }],
              resources: {
                requests: { cpu: "250m", memory: "512Mi" },
                limits: { cpu: "2", memory: "2Gi" },
              },
              securityContext: {
                allowPrivilegeEscalation: false,
                // Kaniko unpacks base images and must chown; drop ALL breaks that.
                // Keep privileged off — pier-system is Pod Security baseline.
                capabilities: {
                  drop: ["ALL"],
                  add: ["CHOWN", "DAC_OVERRIDE", "FOWNER", "SETGID", "SETUID"],
                },
                runAsNonRoot: false,
              },
            },
          ],
        },
      },
    },
  };
}
