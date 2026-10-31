---
name: Pier
description: Calm, precise self-hosted k3s dashboard — black and white first, water blue for interaction.
colors:
  ink: "#000"
  paper: "#fff"
  gray-50: "#FAFAFA"
  gray-100: "#F5F5F5"
  gray-200: "#E5E5E5"
  gray-300: "#D4D4D4"
  gray-400: "#A3A3A3"
  gray-500: "#737373"
  gray-600: "#525252"
  gray-700: "#404040"
  gray-800: "#262626"
  gray-900: "#171717"
  gray-950: "#0A0A0A"
  water-soft: "#E6F2FE"
  water: "#3284D0"
  water-text: "#1B6CB2"
  water-bright: "#69B0F7"
  water-deep: "#092844"
  seacan-soft: "#FFECE4"
  seacan: "#DC632E"
  seacan-text: "#AF4000"
  seacan-bright: "#F7885B"
  seacan-deep: "#431704"
  rust-soft: "#FFEBE5"
  rust: "#9D5037"
  rust-text: "#823A24"
  rust-bright: "#E1957D"
  rust-deep: "#3B1D14"
  running-soft: "#DEF8E7"
  running: "#229E66"
  running-text: "#057D4D"
  running-bright: "#60C28D"
  running-deep: "#022F1B"
  building-soft: "#FDEED7"
  building: "#BF8608"
  building-text: "#8E6200"
  building-bright: "#D99F36"
  building-deep: "#352201"
  failed-soft: "#FEEBE9"
  failed: "#CD4845"
  failed-text: "#AE3131"
  failed-bright: "#FD8079"
  failed-deep: "#451312"
  stopped-soft: "#EEF0F3"
  stopped: "#8A8F99"
  stopped-text: "#646971"
  stopped-bright: "#A6ABB4"
  stopped-deep: "#25262A"
typography:
  display:
    fontFamily: "'Inter Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
  headline:
    fontFamily: "'Inter Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "'Inter Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Inter Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.05em"
  mono:
    fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  pier: "6px"
  pier-lg: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pier}"
    padding: "7px 14px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pier}"
    padding: "7px 14px"
  button-danger:
    backgroundColor: "{colors.failed}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pier}"
    padding: "7px 14px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pier}"
    padding: "8px 12px"
    height: "36px"
  status-pill:
    backgroundColor: "{colors.running-soft}"
    textColor: "{colors.running-text}"
    rounded: "9999px"
    padding: "2px 10px"
    typography: "{typography.label}"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.gray-500}"
    rounded: "{rounded.pier}"
    padding: "7px 10px"
    typography: "{typography.body}"
---

# Design System: Pier

## Overview

**Creative North Star: "The Harbor Console"**

Pier’s UI uses the **Operate** register: a task-first dashboard where the operator scans status, opens an app, and acts—without marketing chrome or decorative colour. The **boardwalk P** identity (italic stem breaking into planks) stays in the logo, loader, and illustration moments; everyday surfaces are **black and white first**, with **water** reserved for interaction and **status hues** reserved for deploy state.

Density follows familiar cloud-dashboard patterns (Vercel / Cloudflare): fixed rem type scale, compact tables, border-defined regions, and a collapsible sidebar plus slim header. Colour supports comprehension; it never competes with content.

**Key Characteristics:**

- Monochrome surfaces (`pier-bg`, `pier-surface`, `pier-border`) with water as the sole interactive accent in chrome.
- Deploy status always **icon + colour + text label**; semantic status tokens switch automatically in dark mode.
- **Border-first elevation**; shadows only on floating overlays (dialog, dropdown, toast)—*(planned in #43)*.
- **Inter Variable** for all UI chrome; **JetBrains Mono Variable** only for code, IDs, hashes, images, and logs.
- Motion conveys state (150–250ms); loader respects `prefers-reduced-motion`.

## Colors

The palette is a harmonised OKLCH band: each hue exposes **soft / base / text / bright / deep** steps for WCAG AA on light and dark surfaces.

### Primary

- **Water (interactive accent):** Links, focus rings, text selection, active nav indicator, and primary interactive emphasis. In code use `text-pier-accent`, `bg-pier-accent-bg`, `outline-pier-focus`, and the `pier-water-*` ramp—never raw hex in components.
- On light surfaces, coloured text and icons use **`pier-water-text`**; on dark surfaces use **`pier-water-bright`**.

### Secondary

- **Seacan (rare highlight):** Badges, “new”, or a single marketing accent—at most one seacan moment per view. Use `pier-seacan-*` tokens sparingly.

### Tertiary

- **Rust:** Illustrations and charts only—not a UI state or button colour. Use `pier-rust-*` in duotone art and data viz.

### Neutral

- **Ink / paper:** `pier-black` and `pier-white` for high-contrast chrome and inverted primary buttons (`bg-pier-fg text-pier-bg`).
- **Surfaces:** `pier-bg`, `pier-surface`, `pier-surface-2` (gray scale 50–950) for page, sidebar, and cards.
- **Borders and text:** `pier-border`, `pier-border-strong`, `pier-muted`, `pier-subtle` for dividers and secondary copy.

### Status (deploy only)

- **Running, building, failed, stopped:** Each has soft background, text, and icon tokens (`text-pier-status-*`, `bg-pier-status-*-bg`, `text-pier-status-*-icon`). Map 1:1 to backend deploy states.

**Kit note:** `pier-brand-kit/brand/BRAND.md` still mentions a **queued** state coloured with water; the frontend and backend dropped `queued` in #41—treat building/running as the live states only.

### Named Rules

**The Status Colours Mean Status Rule.** Green, amber, red, and grey ramps are for deploy state only—not decoration, charts of unrelated data, or generic “success/error” toasts unless they reflect deploy status.

**The Two–Three Accents Rule.** At most two or three accent hues visible in any single view (typically water + one status colour, or water + seacan for a hero empty state).

**The Text Step Rule.** On white or light gray surfaces use `-text` steps for coloured type; on black or deep surfaces use `-bright` steps. Never use base `-water` or `-running` for body text on white.

## Typography

**UI font:** Inter Variable (400 body, 600–700 headings and controls).

**Mono font:** JetBrains Mono Variable—for `code`, pod names, image refs, git SHAs, and log lines only.

**Character:** Fixed rem scale (Operate mode)—no fluid clamp headings. Tight hierarchy, minimal families, maximum scanability.

### Hierarchy

- **Display** (700, 22px): Stat numbers and hero metrics (`StatCard` value row).
- **Headline** (700, 21px / 24px): Page titles (`PageHeader`, app name `h1`).
- **Body** (400–600, 13–14px): Nav items, buttons, table cells, descriptions.
- **Label** (600, 11px, uppercase, tracked): Table headers, section kicks, metadata labels.
- **Mono** (400, 12–12.5px): Image names, refs, inline technical values.

### Named Rules

**The One Sans Rule.** Do not use JetBrains Mono for buttons, nav labels, or headings. Do not import display serifs for product chrome.

## Layout

**Target shell (#43):** 240px sidebar (collapses to icon rail), 56px top header with breadcrumb switcher, `main` content with max readable width for forms and settings prose (~65–75ch where applicable). Tables and log panes may run full content width.

**Current interim shell:** Fixed sidebar (~220px), page-level headers inside a content card over a **slats** pattern gutter (`pattern-slats-*`).

**Responsive:** Below **768px**, sidebar becomes a slide-over drawer; header and menu button remain (#43).

**Density:** Compact table rows (`text-sm`, ~10px vertical cell padding), 24px outer content padding (`p-6`), 16px card padding. Pattern background visible only in the gutter around the primary card.

**Landmarks:** `nav` (sidebar), `header` (top bar), `main` (page content)—required in #43 AppShell.

## Elevation & Depth

Border-first material: surfaces separate with `border-pier-border` and tonal steps (`pier-surface` vs `pier-bg`), not drop shadows. The boardwalk **slats** pattern provides a subtle depth layer behind the main card.

Shadows are **rare**—reserved for overlays (dialog, dropdown, toast) at low opacity. Cards at rest use borders, not elevation shadows.

**Motion:** 150–250ms transitions for hover/focus/open; no page-load choreography. Pier loader SVG hides boat motion under `prefers-reduced-motion`.

## Shapes

- **Default radius:** `rounded-pier` (6px) on buttons, nav items, inputs.
- **Large radius:** `rounded-pier-lg` (10px) on cards and panels where a softer container is needed.
- **Pills:** Full rounding on status chips (`rounded-full`).
- **Borders:** 1px `pier-border` default; `pier-border-strong` for secondary buttons and emphasized edges.

## Components

### Buttons

- **Shape:** `rounded-pier`, 13px semibold label, inline icon gap 6px.
- **Primary:** Inverted ink on paper (`bg-pier-fg text-pier-bg`); hover via opacity.
- **Secondary:** Transparent with `border-pier-border-strong`; hover fills `pier-surface`.
- **Danger *(planned in #43–#46)*:** Destructive confirm actions only (`delete`); uses failed ramp, not generic “error” styling elsewhere.
- **Focus:** 2px `outline-pier-focus`, 2px offset; disabled at 45% opacity.

### Inputs / Fields

- **Style *(planned in #43)*:** `rounded-pier`, border `pier-border-strong`, background `pier-bg`, 13–14px text.
- **Focus:** Ring/border shift to `pier-focus`—match global `:focus-visible` in `index.css`.

### Cards / Containers

- Content cards: `bg-pier-bg`, `border-pier-border`, generous `p-6`; prefer `rounded-pier-lg` for outer cards.
- Sidebar: `bg-pier-surface`, right border, sticky full viewport height.

### Navigation

- **Nav item:** 13.5px, icon 16px outline from sprite; inactive `text-pier-muted`, hover `pier-surface-2`.
- **Active:** Semibold text, `pier-surface-2` fill, **3px inset water bar** on the left (active wayfinding).
- **Mobile *(#43)*:** Drawer with focus trap and Escape to close.

### StatusPill

- Soft status background + status text token + **inline SVG icon** (`currentColor`) + lowercase label.
- Never rely on colour alone; never use `<img>` for status icons (renders black, breaks theming)—inline SVG or sprite symbol.

### Log viewer *(#47)*

- Dark panel in **both** themes (`pier-gray-950` / deep status neutrals), monospace stream, scrollable region, clear timestamp column optional.

### Shared primitives *(planned in #43)*

Toast (`aria-live`), Dialog/confirm (focus trap, Escape), Tabs (link-based, `aria-current`), Select, Skeleton, Table primitives—each uses `pier-*` tokens only; document updates in this file when shipped.

### Brand Assets

Full asset map (source: gitignored `pier-brand-kit/`). Copy into `frontend/public/` only when an issue needs the file.

| Where in the UI | Asset (kit path) | Notes / issue |
|---|---|---|
| Sidebar / header logo | `wordmark/svg/pier-lockup-currentcolor.svg` (inline), or `pier-lockup-black.svg` / `-white.svg` | B&W only in product nav. Min 20px tall, 2X clear space. Never re-type "pier" in a live font. #43 |
| Collapsed sidebar / tight spots | `logo/svg/pier-mark-currentcolor.svg` or `pier-mark-{black,white}-tight.svg` | Min 24px; below that use the favicon marks. #43 |
| Login page | `wordmark/svg/pier-lockup-stacked-*.svg` (min 48px) | Optional subtle `patterns/pattern-waves-*.svg` background. #42 |
| Loading (page / panel) | `loading/svg/loader.svg` inline, `currentColor` | Follows theme; hides boats when reduced motion. Not a static logo. Raster: `loading/webp/pier-loader-*-transparent-256.webp`. #41/#43 |
| Status pill (detail, deploy) | `status/svg/status-<s>.svg` inline (`currentColor`), or the sprite | Never via `<img>`. Always icon + colour + label. #41 |
| Status in dense lists (table rows, sidebar) | `status/svg/dot-<s>-{light,dark}.svg` or a CSS dot with the token | Still paired with text label or `aria-label`. #44 |
| Nav, buttons, table actions | `icons/sprite.svg` (`pier-<name>`, `pier-<name>-solid`) | Outline in nav/buttons, solid for active/selected; 16/20/24/32px. Only `delete` goes red, only in destructive actions. Icon-only buttons need `aria-label`. #43–#46 |
| Empty states (feature cards) | `icons/colour/<name>-{light,dark}.svg` | Duotone, for empty states/docs only. #44/#45 |
| Apps list empty | `illustrations/svg/empty-dock-colour-{light,dark}.svg` | #44 |
| 404 page | `illustrations/svg/lost-at-sea-colour-{light,dark}.svg` | #43 |
| 500 / error boundary | `illustrations/svg/rough-waters-colour-{light,dark}.svg` | #43 |
| App not found (`/apps/:name` 404) | `illustrations/svg/lost-container-colour-{light,dark}.svg` | #45 |
| Deploy succeeded | `illustrations/svg/deployed-colour-{light,dark}.svg` | #46 |
| Backend/cluster unreachable | `illustrations/svg/maintenance-colour-{light,dark}.svg` | #42/#43 |
| Onboarding / first run, README hero | `illustrations/svg/hero-*`, `ship-*` | Marketing/docs only. |
| App background | `patterns/pattern-slats-{light,dark}.svg` (current) | Subtle; alternates: `pattern-container-grid-*`, `pattern-waves-blue-*`. |
| Section dividers | `patterns/divider-wave-*.svg`, `divider-wave-fill.svg` | Sparingly (settings, docs). |
| Favicon / PWA | `favicon/*` (in `public/`) | Always B&W. |
| Link previews | `social/og-image{,-dark}.png` | Not used: private LAN dashboard. |
| Colour logo (water / seacan) | `logo/colour/*` | Never in product chrome—marketing/README/splash only, one colour per surface. |

**Logo rules (product chrome):** 2X clear space (unit X ≈ 9% of mark height); mark ≥24px; horizontal lockup ≥20px; stacked lockup ≥48px; never re-type “pier” in a live font; never stretch, rotate, or recolour planks; colour logo never in navigation or favicon.

## Do's and Don'ts

### Do:

- **Do** use `pier-*` Tailwind utilities and semantic CSS variables—never hard-code hex in `frontend/src/components` or `pages`.
- **Do** keep logo, mark, loader, and favicon **pure black and white** in product UI.
- **Do** pair every status colour with an icon and a visible label (or explicit `aria-label` in dense rows).
- **Do** use water for links, focus, selection, and active nav; seacan for at most one highlight per view.
- **Do** inline `currentColor` SVGs for icons and status so light/dark themes stay correct.
- **Do** respect `prefers-reduced-motion` for the loader and any state animation.

### Don't:

- **Don't** use status greens/reds/ambers for non-status decoration.
- **Don't** use the colour logo (water/seacan planks) in dashboard chrome, sidebar, or favicon.
- **Don't** use the animated loader as a static brand mark, or the mark as a spinner substitute.
- **Don't** re-type “pier” in Inter or any live font—use outlined lockup SVGs.
- **Don't** put status icons in `<img>` tags—they ignore `currentColor` and break on dark backgrounds.
- **Don't** paint arbitrary actions red; **only `delete`** uses the failed/danger palette, and only on confirmed destructive actions.
- **Don't** exceed 2–3 accent hues in a single view.
- **Don't** use rust or seacan for form controls, tables, or default buttons.
