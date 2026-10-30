<p align="center">
  <img src="frontend/public/loading/pier-loader-dark-256.gif" height="250" alt="Pier" />
</p>

<p align="center">
  <strong>Apps dock here.</strong>
</p>

<p align="center">
  <a href="https://k3s.io"><img src="https://img.shields.io/badge/k3s-v1.36.5-FFC61C?style=flat-square&logo=k3s&logoColor=black" alt="k3s v1.36.5"></a>
  <a href="https://kubernetes.io"><img src="https://img.shields.io/badge/Kubernetes-1.36-326CE5?style=flat-square&logo=kubernetes&logoColor=white" alt="Kubernetes 1.36"></a>
  <a href="https://www.proxmox.com"><img src="https://img.shields.io/badge/Proxmox-VE-E57000?style=flat-square&logo=proxmox&logoColor=white" alt="Proxmox VE"></a>
  <a href="https://ubuntu.com/server"><img src="https://img.shields.io/badge/Ubuntu%20Server-26.04-E95420?style=flat-square&logo=ubuntu&logoColor=white" alt="Ubuntu Server 26.04"></a>
</p>

<p align="center">
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.8"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-22-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 22"></a>
  <a href="https://fastify.dev"><img src="https://img.shields.io/badge/Fastify-5.12-000000?style=flat-square&logo=fastify&logoColor=white" alt="Fastify 5.12"></a>
  <a href="https://github.com/kubernetes-client/javascript"><img src="https://img.shields.io/badge/%40kubernetes%2Fclient--node-1.4-326CE5?style=flat-square&logo=kubernetes&logoColor=white" alt="@kubernetes/client-node 1.4"></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19.3-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19.3"></a>
  <a href="https://vite.dev"><img src="https://img.shields.io/badge/Vite-8.3-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 8.3"></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind%20CSS-4.3-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4.3"></a>
</p>

Pier is a lightweight control plane for k3s: a self-hosted dashboard for deploying, monitoring, and managing containerised apps on your own Kubernetes cluster.

## Why I built it

I wanted to actually learn Kubernetes, clusters, and how cloud platforms work under the hood, not just read about them. My home lab runs on Proxmox, and every time I wanted to test or deploy something I'd spin up yet another LXC container by hand. A cluster gives you all of that in one place (scheduling, restarts, networking, routing, scaling), so Pier is my way of building the "push an app, get a URL" experience on hardware I own.

## Development

[![CI](https://github.com/Flapjacck/pier/actions/workflows/ci.yml/badge.svg)](https://github.com/Flapjacck/pier/actions/workflows/ci.yml)

This repo uses [pnpm](https://pnpm.io) (not npm). Backend and frontend are separate pnpm packages:

```bash
pnpm --dir backend install    # installs backend dependencies
pnpm --dir frontend install   # installs frontend dependencies
pnpm --dir backend dev        # http://127.0.0.1:3000
pnpm --dir frontend dev       # http://127.0.0.1:5173
```

### Local checks

Before pushing, run the linter, type-checker, and (backend) tests:

```bash
pnpm --dir backend lint      # ESLint
pnpm --dir backend typecheck # tsc --noEmit
pnpm --dir backend test      # node:test
pnpm --dir backend build     # tsup

pnpm --dir frontend lint     # ESLint
pnpm --dir frontend typecheck # tsc -b
pnpm --dir frontend build    # Vite
```

See [backend/README.md](./backend/README.md) for API/kubeconfig setup.

### Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Commit conventions (conventional commits)
- Feature branch naming and workflow
- Code style and local checks
- Branch protection rules
