import { cn } from "../../lib/cn";
import {
  resolvePierIconId,
  type PierIconName,
} from "./pierIconNames";

interface Props {
  /** Icon name from the pier sprite, e.g. "deploy" or "deploy-solid" */
  name: PierIconName;
  /** Use the solid (filled) variant; ignored when name already ends with -solid */
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
export function PierIcon({
  name,
  solid = false,
  size = 20,
  label,
  className,
}: Props) {
  const resolved = resolvePierIconId(name, solid);
  const id = `pier-${resolved.base}${resolved.solid ? "-solid" : ""}`;
  return (
    <svg
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("block shrink-0", className)}
    >
      <use href={`/icons/sprite.svg#${id}`} />
    </svg>
  );
}
