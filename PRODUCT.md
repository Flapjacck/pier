# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- **Frontend:** React 19, Vite 8, Tailwind CSS v4, React Router; typed API client against the backend (`frontend/`).
- **Backend:** Fastify 5, TypeScript, `@kubernetes/client-node` (`backend/`).
- **Runtime:** Single k3s cluster (home lab on Proxmox); Pier manages apps in the `pier-apps` namespace.
- **Auth:** Cookie session after `POST /api/login` (API token); bearer token also supported for scripts.

## Users

**Primary user:** Spencer, the sole operator of a self-hosted k3s cluster on owned hardware.

**Situation:** Private LAN dashboard (desktop browser first; phone/tablet for quick checks). Example access uses placeholder hostnames such as `192.0.2.10.nip.io`—never real node IPs in docs or commits.

**Job to be done:** Deploy containerised apps, watch build and deploy status, inspect pods and logs, scale/restart/delete workloads, and confirm cluster health—without a multi-tenant cloud control plane.

## Product Purpose

Pier is a lightweight control plane for k3s: a self-hosted dashboard to deploy, monitor, and manage containerised apps on your own Kubernetes cluster. Success means reliable day-two ops (status at a glance, logs when something fails, safe deploy/restart/delete) on hardware the operator controls.

## Positioning

**Apps dock here** on infrastructure you own—a deliberate alternative to renting a hosted PaaS. The mechanism neighbours cannot copy truthfully: one operator, one cluster, one namespace (`pier-apps`), HTTP on the LAN until TLS lands (#29), no billing or multi-tenant RBAC in the MVP.

## Operating Context

- **Environment:** Home lab (Proxmox → k3s); dashboard reached over the private network, not exposed as a public SaaS.
- **Workflows (MVP):** Login → apps list → app detail (overview, pods, logs, settings tabs) → deploy new app → live log tail during builds/deploys (#42–#47).
- **Cluster scope:** Single cluster; ingress hosts use a configurable wildcard suffix (e.g. `*.192.0.2.10.nip.io` in examples).
- **Transport:** HTTP until TLS (#29); session cookie or bearer token for API calls.

## Capabilities and Constraints

**In scope (MVP frontend, #42–#47):**

- Cookie session login and auth guard (#42).
- Apps list from the real API (#44); mock data removed there.
- App detail with tabs: overview, pods, logs, settings (#45).
- Deploy form at `/apps/new` (#46).
- Live log viewer via EventSource (#47).
- App shell: 240px collapsible sidebar, 56px header with breadcrumb switcher, mobile drawer (#43).

**Backend capabilities (existing):** List/create/scale/restart/delete apps in `PIER_NAMESPACE`; list pods; cluster health; session auth.

**Constraints:**

- One operator; no multi-user accounts or RBAC in MVP.
- Deploy statuses align with the backend: `running`, `building`, `failed`, `stopped` (no `queued`—dropped in #41).
- No link-preview / OG images in product (private LAN; removed in #41).
- Do not commit secrets, kubeconfigs, or real cluster IPs/domains.

**Deliberately out of scope (MVP):**

- Multi-cluster management, GitOps/CI integrations, billing, public internet exposure.
- TLS termination (#29), advanced workflow settings in this product record.
- Colour logos in in-product chrome (marketing/README only).

## Brand Commitments

- **Identity:** Boardwalk **P** mark and lockups—pure black and white in product navigation, favicon, and loader.
- **Voice:** Direct, operator-focused copy; status and errors state facts, not marketing fluff.
- **Assets:** Authoritative palette and rules in gitignored `pier-brand-kit/brand/BRAND.md`; runtime tokens in `frontend/src/styles/tokens.css` (frontend wins when kit and app diverge, e.g. no `queued` status).
- **Tagline:** “Apps dock here.”

## Evidence on Hand

| Asset | Location | Notes |
|-------|----------|-------|
| Brand kit (source) | `pier-brand-kit/` (gitignored) | Logos, icons, illustrations, patterns, loader |
| Frontend tokens | `frontend/src/styles/tokens.css`, `tailwind.theme.css` | Normative for shipped UI |
| Public assets | `frontend/public/` | Copied from kit as issues require |
| API contract | `backend/README.md` | Routes, auth, env vars |
| Root README | `README.md` | Product summary and dev commands |

**Do not fabricate:** customer logos, benchmarks, uptime SLAs, or public URLs for the dashboard.

## Product Principles

1. **Operator-first:** Every screen answers “what is running, and what do I do next?” before decoration.
2. **Honest scope:** One cluster, one namespace, one user—UI and copy must not imply enterprise multi-tenancy.
3. **Status is sacred:** Deploy colours mean deploy state only; always pair colour with icon and label.
4. **Familiar shell, Pier details:** Vercel/Cloudflare-style dashboard patterns with boardwalk-P identity in precise places (logo, loader, empty states).
5. **Accessible by default:** WCAG AA contrast via token steps (`-text` on light, `-bright` on dark); keyboard-navigable; visible focus; respect `prefers-reduced-motion`.

## Accessibility & Inclusion

- Target **WCAG 2.x AA** contrast for text and interactive elements; use kit `-text` steps on white and `-bright` steps on black surfaces.
- **Never convey status by colour alone**—icon + label (or `aria-label` in dense rows).
- **Keyboard:** All primary flows (nav, tables, dialogs, tabs planned in #43) must be reachable and operable without a pointer; visible `:focus-visible` rings using `pier-focus` (water).
- **Motion:** Respect `prefers-reduced-motion` (loader hides animated boats; avoid decorative motion).
- **Desktop first, mobile usable:** Shell collapses to drawer under 768px (#43).
