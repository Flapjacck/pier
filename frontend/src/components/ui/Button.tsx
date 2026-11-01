import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "sm" | "icon";
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-1.5 font-semibold font-sans " +
  "rounded-pier whitespace-nowrap cursor-pointer transition-opacity " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pier-focus " +
  "disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none";

const sizes = {
  default: "px-3.5 py-[7px] text-[13px]",
  sm: "px-2.5 py-1.5 text-[12px]",
  icon: "p-2 text-[13px]",
};

const variants = {
  primary:
    "bg-pier-fg text-pier-bg border-0 hover:opacity-80 disabled:hover:opacity-45",
  secondary:
    "bg-transparent text-pier-fg border border-pier-border-strong hover:bg-pier-surface " +
    "transition-colors disabled:hover:bg-transparent",
  ghost:
    "bg-transparent text-pier-fg border-0 hover:bg-pier-surface-2 transition-colors",
  danger:
    "bg-pier-status-failed text-pier-bg border-0 hover:opacity-90 disabled:hover:opacity-45",
};

/**
 * Pier-styled button with primary, secondary, ghost, and danger variants.
 */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "default", className, children, ...rest },
  ref,
) {
  return (
    <button ref={ref} className={cn(base, sizes[size], variants[variant], className)} {...rest}>
      {children}
    </button>
  );
});
