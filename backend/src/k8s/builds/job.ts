import type { V1Job } from "@kubernetes/client-node";
import { MANAGED_BY_LABEL, MANAGED_BY_VALUE } from "../labels.js";
import { gitCredentialSecretName } from "../git-credentials/secrets.js";
import { kanikoGitContext, type BuildSource } from "./source.js";

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

/** DNS-1123 Job name: pier-build-<app>-<id>, truncated to 63. */
export function buildJobName(app: string, deployId: number): string {
  const base = `pier-build-${app}-${deployId}`;
  return base.length <= 63 ? base : `pier-build-${deployId}`.slice(0, 63);
}

export function buildJobSpec(input: BuildJobInput): V1Job {
  const name = buildJobName(input.app, input.deployId);
  const args = [
    `--context=${kanikoGitContext(input.source)}`,
    `--dockerfile=${input.source.dockerfile}`,
    `--destination=${input.destination}`,
    "--insecure",
    "--insecure-pull",
    "--skip-tls-verify",
  ];

  const env: { name: string; valueFrom?: { secretKeyRef: { name: string; key: string } } }[] = [];
  if (input.source.gitCredential) {
    const secret = gitCredentialSecretName(input.source.gitCredential);
    env.push(
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
          containers: [
            {
              name: "kaniko",
              image: input.kanikoImage,
              imagePullPolicy: "IfNotPresent",
              args,
              env: env.length ? env : undefined,
              resources: {
                requests: { cpu: "250m", memory: "512Mi" },
                limits: { cpu: "2", memory: "2Gi" },
              },
              securityContext: {
                allowPrivilegeEscalation: false,
                capabilities: { drop: ["ALL"] },
                // Kaniko needs root inside the container to execute builds; no privileged / hostPath.
                runAsNonRoot: false,
              },
            },
          ],
        },
      },
    },
  };
}
