## What & why
<!-- What does this PR change, and why? Keep it short. -->

Closes #

## Changes
- 

## How I tested it
<!-- Commands you ran and what you saw: curl output, kubectl output, screenshots. -->
- [ ] `pnpm --dir backend lint` passes
- [ ] `pnpm --dir backend typecheck` is clean
- [ ] `pnpm --dir backend test` passes
- [ ] `pnpm --dir backend build` succeeds
- [ ] `pnpm --dir frontend lint` passes
- [ ] `pnpm --dir frontend typecheck` is clean
- [ ] `pnpm --dir frontend build` succeeds
- [ ] Checked against the cluster (`kubectl` / `curl` output below)

```text

```

## Cluster impact
- [ ] No manifest or RBAC changes
- [ ] Changes `backend/k8s/` manifests or RBAC (say what to `kubectl apply`)
- [ ] Needs new env vars (added to `backend/.env.example`)

## Checklist
- [ ] Meets the pass criteria in the linked issue
- [ ] No secrets, kubeconfigs, or `.env` files committed
- [ ] README or docs updated if behaviour changed
- [ ] Opened from a feature branch into `main`
