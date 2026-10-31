import type { Theme } from "../hooks/usePierTheme";

interface Props {
  theme: Theme;
}

/**
 * Animated loading spinner that follows the active app theme.
 * Uses theme-specific webp images with fallback to GIFs if webp is not supported.
 * Dark theme shows white spinner on dark background; light theme shows black on light.
 */
export function PierLoader({ theme }: Props) {
  const isLight = theme === "light";
  const src = isLight
    ? "/loading/pier-loader-black-transparent-256.webp"
    : "/loading/pier-loader-white-transparent-256.webp";

  return (
    <img
      src={src}
      alt="Loading..."
      className="w-16 h-16"
      aria-label="Loading"
    />
  );
}
