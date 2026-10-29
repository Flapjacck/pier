interface Props {
  /** Icon name from the pier sprite, e.g. "deploy", "app", "logs" */
  name: string;
  /** Use the solid (filled) variant */
  solid?: boolean;
  size?: number;
  /** Accessible label — set for icon-only usage */
  label?: string;
  className?: string;
}

/**
 * Renders a pier UI icon from /icons/sprite.svg using <use>.
 * All icons use currentColor so they inherit the parent text colour.
 *
 * See BRAND.md §8b for the full icon list and usage guidelines.
 */
export function PierIcon({ name, solid = false, size = 20, label, className }: Props) {
  const id = `pier-${name}${solid ? "-solid" : ""}`;
  return (
    <svg
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
      style={{ display: "block", flexShrink: 0 }}
    >
      <use href={`/icons/sprite.svg#${id}`} />
    </svg>
  );
}
