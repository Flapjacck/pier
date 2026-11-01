import { useTheme } from "../../context/ThemeContext";

interface Props {
  /** Base filename without theme suffix, e.g. "lost-at-sea-colour" */
  base: string;
  alt: string;
  className?: string;
  width?: number;
}

/** Picks light or dark illustration from public/illustrations/. */
export function ThemeIllustration({ base, alt, className, width = 320 }: Props) {
  const { theme } = useTheme();
  const src = `/illustrations/${base}-${theme}.svg`;
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={Math.round(width * 0.75)}
      className={className}
      draggable={false}
    />
  );
}
