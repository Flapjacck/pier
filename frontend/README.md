# Pier frontend

React 19 + Vite 8 + Tailwind CSS v4 dashboard for the Pier control plane. Mock app data lives in `src/data/mockApps.ts` until the API list/detail endpoints are wired.

## Design context

Before changing layout, tokens, or components, read the repo-root **[PRODUCT.md](../PRODUCT.md)** (who Pier is for, MVP scope, constraints) and **[DESIGN.md](../DESIGN.md)** (Operate-mode dashboard system, tokens, components, asset map). Future frontend issues (#43–#47) treat those files as the single source of truth; update `DESIGN.md` when you add or change a shared component pattern.

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
| `src/main.tsx` | Entry: font imports + global CSS |
| `src/styles/tokens.css` | Pier semantic CSS variables (light/dark via `data-theme`) |
| `src/styles/tailwind.theme.css` | Tailwind v4 `@theme` aliases → utilities (`bg-pier-*`, `text-pier-status-*`, …) |
| `src/styles/index.css` | Tailwind import, token imports, base resets |
| `src/components/` | UI, layout, brand, icons |
| `src/pages/` | Route-level views |
| `src/hooks/usePierTheme.ts` | Theme state, `localStorage`, `theme-color` meta |
| `public/` | Static assets copied into `dist/` as-is |

## Tokens and theme

- **Palette source of truth:** `src/styles/tokens.css` (kept in sync with `pier-brand-kit/brand/tokens.css` when the kit changes).
- **Tailwind utilities:** `src/styles/tailwind.theme.css` maps tokens to classes such as `bg-pier-surface`, `text-pier-muted`, `rounded-pier` (6px), `rounded-pier-lg` (10px), and status helpers `text-pier-status-running`, `bg-pier-status-running-bg`, etc.
- **Dark mode:** `<html data-theme="light|dark">`, set by the inline script in `index.html` and `usePierTheme`.
- **Fonts:** `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono` are imported once in `main.tsx`. Family names in CSS must be `'Inter Variable'` and `'JetBrains Mono Variable'`.

## Brand assets

Copy only what the app references from the gitignored **`pier-brand-kit/`** tree into `public/`:

- Favicons, `icons/sprite.svg`, `status/*.svg`, `loading/*`, logos/wordmarks
- Illustrations under `public/illustrations/` (e.g. `empty-dock`, `lost-at-sea`, `rough-waters`)

Icon ids in the sprite are `pier-<name>` and `pier-<name>-solid`; see `src/components/icons/pierIconNames.ts`.

## No hex in components

Do not hard-code `#…` colours in `src/components` or `src/pages`. Use Tailwind pier utilities or semantic CSS variables from `tokens.css`. Hex values belong in `src/styles/` only.

## Local API proxy

Dev server proxies API routes to the backend (see `vite.config.ts`). Use placeholder hostnames such as `192.0.2.10.nip.io` in examples—never commit real cluster IPs or production domains.
