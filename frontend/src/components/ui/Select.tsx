import type { SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

const selectClass =
  "w-full h-9 px-3 text-[13.5px] rounded-pier border border-pier-border-strong " +
  "bg-pier-bg text-pier-fg " +
  "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-pier-focus " +
  "disabled:opacity-45 disabled:cursor-not-allowed";

export function Select({ className, invalid, children, ...rest }: Props) {
  return (
    <select
      className={cn(selectClass, invalid && "border-pier-status-failed", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
}
