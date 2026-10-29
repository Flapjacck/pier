/**
 * Pier branded loader using the animated WebP with GIF fallback.
 * Follows BRAND.md: WebP primary, GIF fallback, transparent-background variant
 * to work on any surface, theme-aware via media query in <source>.
 *
 * Only use at 64 px and above (per BRAND.md). Not suitable as a button spinner.
 */
interface Props {
  size?: number;
  label?: string;
  className?: string;
}

export function PierLoader({ size = 96, label = "Loading…", className }: Props) {
  return (
    <picture role="status" aria-label={label} className={className}>
      {/* Dark: white marks on transparent */}
      <source
        srcSet="/loading/pier-loader-white-transparent-256.webp"
        media="(prefers-color-scheme: dark)"
        type="image/webp"
      />
      {/* Light: black marks on transparent (WebP) */}
      <source
        srcSet="/loading/pier-loader-black-transparent-256.webp"
        type="image/webp"
      />
      {/* GIF fallback (light, opaque) */}
      <img
        src="/loading/pier-loader-light-256.gif"
        width={size}
        height={size}
        alt={label}
        style={{ display: "block" }}
      />
    </picture>
  );
}
