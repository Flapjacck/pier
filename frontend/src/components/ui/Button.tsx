import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  children: ReactNode;
}

const base =
  "inline-flex items-center gap-1.5 px-3.5 py-[7px] text-[13px] font-semibold font-sans " +
  "rounded-md whitespace-nowrap cursor-pointer transition-opacity " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pier-focus " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

const variants = {
  primary:
    "bg-pier-fg text-pier-bg border-0 hover:opacity-80",
  secondary:
    "bg-transparent text-pier-fg border border-pier-border-strong hover:bg-pier-surface " +
    "transition-colors",
};

/**
 * Pier-styled button.
 * Primary: inverted (fg on bg) — main call-to-action.
 * Secondary: ghost with border.
 */
export function Button({ variant = "primary", className, children, ...rest }: Props) {
  return (
    <button className={cn(base, variants[variant], className)} {...rest}>
      {children}
    </button>
  );
}
