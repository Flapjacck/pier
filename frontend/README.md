# Pier frontend

React 19 + Vite 8 + Tailwind CSS v4 dashboard for the Pier control plane. Mock app data lives in `src/data/mockApps.ts` until the API list/detail endpoints are wired (#44).

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
| `src/router.tsx` | `createBrowserRouter` routes, `AppShell` layout, error/404 routes |
| `src/context/` | `ThemeContext` (`useTheme`), `ShellContext`, `PageActionsContext` |
| `src/styles/tokens.css` | Pier semantic CSS variables (light/dark via `data-theme`) |
| `src/styles/tailwind.theme.css` | Tailwind v4 `@theme` aliases → utilities |
| `src/styles/index.css` | Tailwind import, token imports, base resets |
| `src/components/layout/` | `AppShell`, `Sidebar`, `Header`, mobile drawer |
| `src/components/ui/` | Shared primitives (Button, Dialog, Toast, Table, …) |
| `src/components/` | Apps, brand, icons |
| `src/pages/` | Route-level views |
| `src/hooks/usePierTheme.ts` | Theme persistence and `data-theme` sync (used by `ThemeProvider`) |
| `src/lib/` | Status helpers, API stubs (`TODO(#42)`) |
| `public/` | Static assets copied into `dist/` as-is |

## Routing

- `/` → redirect to `/apps`
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

## Local API proxy

Dev server proxies API routes to the backend (see `vite.config.ts`). Use placeholder hostnames such as `192.0.2.10.nip.io` in examples—never commit real cluster IPs or production domains.
