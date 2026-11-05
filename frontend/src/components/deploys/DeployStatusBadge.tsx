import type { DeployStatus } from "../../api/types";
import { cn } from "../../lib/cn";
import { deployStatusTone } from "../../lib/deploys";
import { getStatusClasses } from "../../lib/status";
import { StatusIcon } from "../apps/StatusIcon";

/** Deploy status pill: colour + icon + label (BRAND.md), using the app status tokens. */
export function DeployStatusBadge({ status }: { status: DeployStatus }) {
  const tone = deployStatusTone(status);
  const t = getStatusClasses(tone);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full",
        "text-[12.5px] font-semibold leading-tight",
        t.text,
        t.background,
      )}
    >
      <span className={cn(t.icon, status === "running" && "motion-safe:animate-pulse")}>
        <StatusIcon status={tone} />
      </span>
      {status}
    </span>
  );
}
