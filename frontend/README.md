# Pier frontend

React 19 + Vite 8 + Tailwind CSS v4 dashboard for the Pier control plane. Apps list loads from the backend API; no mock data.

## Design context

Before changing layout, tokens, or components, read the repo-root **[PRODUCT.md](../PRODUCT.md)** (who Pier is for, MVP scope, constraints) and **[DESIGN.md](../DESIGN.md)** (Operate-mode dashboard system, tokens, components, asset map). Update `DESIGN.md` when you add or change a shared component pattern.

## Scripts

From the repo root (uses the frontend pnpm package):

```bash
pnpm --dir frontend install
pnpm --dir frontend dev        # http://127.0.0.1:5173
pnpm --dir frontend lint
pnpm --dir frontend typecheck
pnpm --dir frontend build      # output in frontend/dist/
```

## Folder layout

| Path | Purpose |
|------|---------|
| `src/main.tsx` | Entry: fonts, global CSS, `ThemeProvider`, `ToastProvider`, router |
| `src/App.tsx` | `RouterProvider` |
| `src/router.tsx` | Routes, `AuthProvider`, `RequireAuth`, `AppShell`, login |
| `src/api/` | Typed API client (`types.ts`, `client.ts`, `request.ts`, `errors.ts`) |
| `src/context/` | `AuthContext`, `ThemeContext`, `ShellContext`, `PageActionsContext` |
| `src/hooks/useApi.ts` | Small fetch hook (loading, error, data, refetch, abort on unmount) |
| `src/hooks/useLogStream.ts` | Live log streaming (EventSource with exponential backoff or static fetch) (#47, #65) |
| `src/components/ui/LogsCard.tsx` | Composed log viewer card: header, menu, and panel (#65) |
| `src/components/logs/LogsHeader.tsx` | Log viewer header bar with status, search, pod/tail selectors, and menu trigger (#65) |
| `src/components/logs/LogsActionsMenu.tsx` | Copy/Download menu using shared Menu component (#65) |
| `src/components/logs/LogsPanel.tsx` | Scrollable logs display with line numbers and "new lines" pill (#65) |
| `src/hooks/useApps.ts` | Apps list fetcher with 10s auto-refresh (visible-tab only, no overlapping requests) |
| `src/styles/tokens.css` | Pier semantic CSS variables (light/dark via `data-theme`) |
| `src/styles/tailwind.theme.css` | Tailwind v4 `@theme` aliases → utilities |
| `src/styles/index.css` | Tailwind import, token imports, base resets |
| `src/components/layout/` | `AppShell`, `Sidebar`, `Header`, mobile drawer |
| `src/components/ui/` | Shared primitives (Button, Dialog, Toast, Table, Menu, StatusBadge, …) |
| `src/components/ui/Menu.tsx` | Keyboard-navigable listbox dropdown (Escape, arrow keys, Enter) with focus management (#65) |
| `src/lib/logBuffer.ts` | Capped line buffer with ANSI stripping, stable ids (#47) |
| `src/components/` | Apps, brand, icons, auth guards |
| `src/pages/` | Route-level views (including `LoginPage`) |
| `src/hooks/usePierTheme.ts` | Theme persistence and `data-theme` sync (used by `ThemeProvider`) |
| `src/lib/` | Status helpers, cluster health, `safeNext` |
| `public/` | Static assets copied into `dist/` as-is |

## API client and auth

- **Client:** `src/api/client.ts` exports typed functions for every backend route. Errors throw `ApiError` with `status`, `error`, `details?`, and a `kind` discriminator. JSON bodies are validated with small runtime guards in `src/api/guards.ts` (no `any`, no unchecked casts).
- **Session:** `POST /api/login` with `{ token }` sets the HttpOnly `pier_session` cookie (path `/api`). The token is sent once in the POST body and is **not** stored in JavaScript (`localStorage`, `sessionStorage`, or JS-readable cookies). `GET /api/session` returns `{ ok, authDisabled, ingressDomain }` so the frontend knows the cluster's domain suffix for host prefill on deploy forms.
- **Guard:** `AuthProvider` probes `GET /api/session` on load. `RequireAuth` sends anonymous users to `/login?next=…` (same-origin paths only). Any other `401` triggers the same redirect via a global handler registered from auth context.
- **Data hook:** `useApi` is an in-house hook (no TanStack Query) to keep dependencies minimal and match Pier’s small surface area; it aborts on unmount and dependency changes.

## Local dev (frontend + backend)

**Required:** Backend must be running for the apps list and detail endpoints to work.

1. In `backend/`, set `PIER_API_TOKEN` in `.env` and run `pnpm dev` (listens on port 3000).
2. In another terminal: `pnpm --dir frontend dev` (port 5173).
3. Open `http://localhost:5173`. API calls go to the same origin and are **proxied** to the backend (`vite.config.ts`).

### Dev proxy and cookies

Vite proxies `/api` and `/health` to `http://127.0.0.1:3000` with **`changeOrigin: false`** so the proxied request keeps `Host: localhost:5173`, matching the browser `Origin` on cookie-authenticated POST/PUT/PATCH/DELETE. With `changeOrigin: true`, the backend’s Origin check returns `403 forbidden origin` during local login and mutations.

## Routing

- `/login` → public sign-in (no shell)
- `/` → redirect to `/apps` (requires session)
- `/apps` → inside `AppShell` (sidebar + header + `main`); apps list with search, refresh, auto-update every 10s
- `/apps/new` → Deploy form (create new app with validation and error mapping)
- `/apps/:name` → nested routes with `AppDetailLayout`:
  - `/:name` (index) → Overview tab (image, port, replicas, host, URL, created)
  - `/:name/pods` → Pods tab (list, refresh, reasons)
  - `/:name/logs` → Logs tab (live EventSource or static with pod/tail picker, follow toggle, auto-scroll, ⋯ menu)
  - `/:name/settings` → Settings tab (scale, restart, delete)
- `*` → `NotFoundPage` (still in shell)
- Route/render errors → `ErrorPage` (`errorElement`)
- Dev only: `/__boom` throws to test the error boundary

## Tokens and theme

- **Palette source of truth:** `src/styles/tokens.css`
- **Dark mode:** `<html data-theme="light|dark">`, set by the inline script in `index.html` and `usePierTheme` / `useTheme()`
- **Fonts:** Inter Variable and JetBrains Mono Variable via `main.tsx`

## Brand assets

Copy only what the app references from the gitignored **`pier-brand-kit/`** tree into `public/`.

## Log streaming (#47, #65)

- **Live logs:** `useLogStream` hook opens `EventSource` to `/api/apps/:name/logs?follow=true&pod=…&tail=…` and streams lines. On connection error, it probes with one-line fetch to classify (pod gone, cluster down, transient), then reconnects with exponential backoff (1s, 2s, 4s… up to 30s ± 20% jitter; attempt counter resets on successful open). Stream closes on unmount, pod/tail/follow change, or backend `end` event. Pushes divider line on reconnect showing dropped line count.
- **Static mode:** When `follow=false`, one `getAppLogsText` fetch clears the buffer first, then returns tail lines as plain text. Status is "Paused".
- **Buffer:** `LogBuffer` stores `.n` (line number, stable incremental) and `.text` (ANSI-stripped). Returns fresh arrays via `getLines()` and tracks drops via `append()` result. Capped at 5000 lines with efficient `slice()` not `shift()`. `clear()` resets the line counter.
- **UI:** `LogsCard` composes three sub-components for ≤250 lines each:
  - `LogsHeader`: status dot + label, search, pod/tail/follow selectors, retry buttons, ⋯ menu trigger
  - `LogsActionsMenu`: Copy/Download options using the shared `Menu` component (keyboard accessible, Escape closes, focus returns to trigger)
  - `LogsPanel`: scrollable pre with line numbers, "new lines" pill inside the card (tracks `lastSeenNRef` for accuracy past 5000 lines)
- **Pod fallback:** If selected pod is removed (e.g., after restart), falls back to newest pod from list. Pod error state is shown instead of skeleton.

## No hex in components

Do not hard-code `#…` colours in `src/components` or `src/pages`. Use Tailwind pier utilities or semantic CSS variables from `tokens.css`. Hex values belong in `src/styles/` only.
