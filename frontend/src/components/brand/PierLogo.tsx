import type { Theme } from "../../hooks/usePierTheme";

interface Props {
  theme: Theme;
  height?: number;
  className?: string;
}

/**
 * Pier wordmark lockup — horizontal "P + pier" mark in pure black or white.
 * Uses the B&W SVG per BRAND.md: colour logo is secondary/optional;
 * the default in-app chrome is always the black or white lockup.
 */
export function PierLogo({ theme, height = 26, className }: Props) {
  const src =
    theme === "dark"
      ? "/wordmark/pier-lockup-white.svg"
      : "/wordmark/pier-lockup-black.svg";

  return (
    <img
      src={src}
      height={height}
      alt="Pier"
      draggable={false}
      className={`block select-none ${className ?? ""}`}
    />
  );
}
