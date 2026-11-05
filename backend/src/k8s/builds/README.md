# Builds (`k8s/builds`)

Kaniko Jobs that build a Dockerfile from a git repo and push to Pier's in-cluster registry (`localhost:30500` by default). See issue #83.

- `source.ts` — validate repo/branch/folder/dockerfile; Kaniko git context URL
- `job.ts` — Job manifest (non-privileged, no hostPath, `backoffLimit: 0`)
- `run.ts` — create Job, stream pod logs, wait for success/failure/timeout

Git credentials (optional) are Secrets named `pier-git-<name>` in `pier-system`; see `k8s/git-credentials/`.
