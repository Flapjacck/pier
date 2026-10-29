import { getStatusTokens } from "../../lib/status";
import type { DeployStatus } from "../../types/app";

interface Props { status: DeployStatus; }

/**
 * Coloured status pill with icon + label.
 * Colours come from CSS custom properties (tokens.css) so light/dark
 * switching is automatic — no JS colour logic needed here.
 * Per BRAND.md: always pair status colour with an icon AND a label.
 */
export function StatusPill({ status }: Props) {
  const t = getStatusTokens(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full
                 text-[12.5px] font-semibold leading-tight"
      style={{ color: t.color, background: t.background }}
    >
      <img src={t.icon} width={13} height={13} aria-hidden="true" alt="" className="block shrink-0" />
      {t.label}
    </span>
  );
}
