import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { cn } from "../../lib/cn";

interface Props {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
  className?: string;
}

/** Label + control wrapper with hint and error wired via aria-describedby. */
export function Field({ id, label, hint, error, children, className }: Props) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control =
    isValidElement(children)
      ? cloneElement(children, {
          id,
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
        })
      : children;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-pier-fg">
        {label}
      </label>
      {control as ReactNode}
      {hint && (
        <p id={hintId} className="text-[12px] text-pier-muted m-0">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[12px] text-pier-status-failed m-0" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
