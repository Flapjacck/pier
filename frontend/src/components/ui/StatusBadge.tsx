import { cn } from "../../lib/cn";
import { Button } from "./Button";
import type { LogStreamStatus } from "../../hooks/useLogStream";

interface StatusBadgeProps {
  status: LogStreamStatus;
  onReconnect?: () => void;
}

/**
 * Status indicator badge for log stream state with action buttons.
 * ≤250 lines, extracted from LogViewer for modularity.
 */
export function StatusBadge({ status, onReconnect }: StatusBadgeProps) {
  const statusTexts: Record<LogStreamStatus["kind"], { label: string }> = {
    loading: { label: "Loading…" },
    live: { label: "Live" },
    reconnecting: { label: "Reconnecting…" },
    ended: { label: "Stream ended" },
    "pod-gone": { label: "Pod is gone" },
    error: { label: "Error" },
    static: { label: "Static" },
  };

  const st = statusTexts[status.kind];
  const color =
    status.kind === "live"
      ? "text-pier-status-running-text"
      : status.kind === "reconnecting"
        ? "text-pier-status-building-text"
        : status.kind === "error" || status.kind === "pod-gone"
          ? "text-pier-status-failed-text"
          : "text-pier-muted";

  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2">
      <span className="text-[13px]">●</span>
      <span className={cn("text-[13px] font-medium", color)}>{st.label}</span>

      {status.kind === "reconnecting" && (
        <>
          <span className="text-[12px] text-pier-muted">
            in {Math.ceil(status.nextRetryMs / 1000)}s
          </span>
          {onReconnect && (
            <Button variant="secondary" size="sm" onClick={onReconnect}>
              Retry now
            </Button>
          )}
        </>
      )}

      {status.kind === "pod-gone" && onReconnect && (
        <Button variant="secondary" size="sm" onClick={onReconnect}>
          Switch to newest pod
        </Button>
      )}

      {status.kind === "error" && (
        <>
          <span className="text-[12px] text-pier-muted">{status.message}</span>
          {onReconnect && (
            <Button variant="secondary" size="sm" onClick={onReconnect}>
              Retry
            </Button>
          )}
        </>
      )}
    </div>
  );
}
