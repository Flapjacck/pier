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
| `src/hooks/useApps.ts` | Apps list fetcher with 10s auto-refresh (visible-tab only, no overlapping requests) |
| `src/styles/tokens.css` | Pier semantic CSS variables (light/dark via `data-theme`) |
| `src/styles/tailwind.theme.css` | Tailwind v4 `@theme` aliases → utilities |
| `src/styles/index.css` | Tailwind import, token imports, base resets |
| `src/components/layout/` | `AppShell`, `Sidebar`, `Header`, mobile drawer |
| `src/components/ui/` | Shared primitives (Button, Dialog, Toast, Table, …) |
| `src/components/` | Apps, brand, icons, auth guards |
| `src/pages/` | Route-level views (including `LoginPage`) |
| `src/hooks/usePierTheme.ts` | Theme persistence and `data-theme` sync (used by `ThemeProvider`) |
| `src/lib/` | Status helpers, cluster health, `safeNext` |
| `public/` | Static assets copied into `dist/` as-is |

## API client and auth

- **Client:** `src/api/client.ts` exports typed functions for every backend route. Errors throw `ApiError` with `status`, `error`, `details?`, and a `kind` discriminator. JSON bodies are validated with small runtime guards in `src/api/guards.ts` (no `any`, no unchecked casts).
- **Session:** `POST /api/login` with `{ token }` sets the HttpOnly `pier_session` cookie (path `/api`). The token is sent once in the POST body and is **not** stored in JavaScript (`localStorage`, `sessionStorage`, or JS-readable cookies).
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
- `/apps`, `/apps/:name` → inside `AppShell` (sidebar + header + `main`)
- `*` → `NotFoundPage` (still in shell)
- Route/render errors → `ErrorPage` (`errorElement`)
- Dev only: `/__boom` throws to test the error boundary

## Tokens and theme

- **Palette source of truth:** `src/styles/tokens.css`
- **Dark mode:** `<html data-theme="light|dark">`, set by the inline script in `index.html` and `usePierTheme` / `useTheme()`
- **Fonts:** Inter Variable and JetBrains Mono Variable via `main.tsx`

## Brand assets

Copy only what the app references from the gitignored **`pier-brand-kit/`** tree into `public/`.

## No hex in components

Do not hard-code `#…` colours in `src/components` or `src/pages`. Use Tailwind pier utilities or semantic CSS variables from `tokens.css`. Hex values belong in `src/styles/` only.
