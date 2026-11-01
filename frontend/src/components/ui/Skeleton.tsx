import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** Optional width class, e.g. w-32 */
  className?: string;
}

/** Placeholder block; pulses only when motion is allowed. */
export function Skeleton({ className, ...rest }: Props) {
  return (
    <div
      role="presentation"
      className={cn(
        "rounded-pier bg-pier-surface-2 motion-safe:animate-pulse",
        className,
      )}
      {...rest}
    />
  );
}
