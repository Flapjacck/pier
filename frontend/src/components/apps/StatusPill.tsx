import { cn } from "../../lib/cn";
import { getStatusClasses } from "../../lib/status";
import type { AppStatus } from "../../api/types";
import { StatusIcon } from "./StatusIcon";

interface Props {
  status: AppStatus;
}

/**
 * Coloured status pill with icon + label.
 * Colours use Tailwind pier-status utilities backed by tokens.css.
 * Per BRAND.md: always pair status colour with an icon AND a label.
 */
export function StatusPill({ status }: Props) {
  const t = getStatusClasses(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full",
        "text-[12.5px] font-semibold leading-tight",
        t.text,
        t.background,
      )}
    >
      <span className={t.icon}>
        <StatusIcon status={status} />
      </span>
      {t.label}
    </span>
  );
}
