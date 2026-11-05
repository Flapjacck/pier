# Registry Secret helpers

The registry helpers create Pier-managed `kubernetes.io/dockerconfigjson`
Secrets in `pier-apps`. Secret names use `pier-registry-<name>` and labels and
annotations expose only the registry name, host, and username. The password is
kept in the encoded config and is never returned by the API or audit log.

Docker Hub is normalized to `docker.io`; its Docker-compatible
`https://index.docker.io/v1/` auth key is written alongside the normalized host.
The app routes verify registry references before attaching the Secret to a pod.
