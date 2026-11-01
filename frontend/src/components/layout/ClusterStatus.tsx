import type { ClusterHealthState } from "../../lib/clusterHealth";
import { cn } from "../../lib/cn";

const LABEL: Record<ClusterHealthState, string> = {
  online: "Cluster online",
  unreachable: "Unreachable",
  checking: "Checking…",
};

const DOT: Record<ClusterHealthState, string> = {
  online: "bg-pier-status-running",
  unreachable: "bg-pier-status-failed",
  checking: "bg-pier-muted motion-safe:animate-pulse",
};

interface Props {
  state: ClusterHealthState;
  compact?: boolean;
}

export function ClusterStatus({ state, compact }: Props) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-pier-muted",
        compact && "justify-center px-0",
      )}
      title={compact ? LABEL[state] : undefined}
    >
      <span
        className={cn("size-2 rounded-full shrink-0", DOT[state])}
        aria-hidden
      />
      {!compact && <span>{LABEL[state]}</span>}
      {compact && <span className="sr-only">{LABEL[state]}</span>}
    </div>
  );
}
