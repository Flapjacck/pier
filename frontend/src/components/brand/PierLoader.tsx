import { cn } from "../../lib/cn";
import { LOADER_INNER } from "./loaderInner";

interface Props {
  size?: number;
  label?: string;
  className?: string;
}

/**
 * Pier branded loader — inline SVG with currentColor fill and SMIL boat motion.
 * Respects prefers-reduced-motion via embedded stylesheet in the SVG markup.
 */
export function PierLoader({ size = 96, label = "Loading…", className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="currentColor"
      role="status"
      aria-label={label}
      className={cn("block text-pier-fg", className)}
      // SVG ships with <style> and SMIL from the brand kit; JSX cannot express it cleanly.
      dangerouslySetInnerHTML={{ __html: LOADER_INNER }}
    />
  );
}
