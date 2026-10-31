import type { Theme } from "../../hooks/usePierTheme";

/**
 * Pier branded loader using the animated WebP with GIF fallback.
 * Follows BRAND.md: WebP primary, GIF fallback, transparent-background variant
 * to work on any surface. Theme is driven by the app (not prefers-color-scheme).
 *
 * Only use at 64 px and above (per BRAND.md). Not suitable as a button spinner.
 */
interface Props {
  theme: Theme;
  size?: number;
  label?: string;
  className?: string;
}

export function PierLoader({ theme, size = 96, label = "Loading…", className }: Props) {
  const isDark = theme === "dark";
  const webp = isDark
    ? "/loading/pier-loader-white-transparent-256.webp"
    : "/loading/pier-loader-black-transparent-256.webp";
  const gifFallback = isDark
    ? "/loading/pier-loader-dark-256.gif"
    : "/loading/pier-loader-light-256.gif";

  return (
    <picture role="status" aria-label={label} className={className}>
      <source srcSet={webp} type="image/webp" />
      <img
        src={gifFallback}
        width={size}
        height={size}
        alt={label}
        className="block"
      />
    </picture>
  );
}
