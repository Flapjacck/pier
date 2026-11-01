import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

const inputClass =
  "w-full h-9 px-3 text-[13.5px] rounded-pier border border-pier-border-strong " +
  "bg-pier-bg text-pier-fg placeholder:text-pier-subtle " +
  "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-pier-focus " +
  "disabled:opacity-45 disabled:cursor-not-allowed";

export function Input({ className, invalid, ...rest }: Props) {
  return (
    <input
      className={cn(inputClass, invalid && "border-pier-status-failed", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
