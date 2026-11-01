import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import type { LogStreamStatus } from "../../hooks/useLogStream";
import type { AppPod } from "../../api/types";

interface LogsHeaderProps {
  status: LogStreamStatus;
  droppedCount: number;
  selectedPod: string;
  pods: AppPod[];
  onSelectPod: (pod: string) => void;
  selectedTail: number;
  onSelectTail: (tail: number) => void;
  follow: boolean;
  onToggleFollow: (on: boolean) => void;
  search: string;
  onSearchChange: (search: string) => void;
  filteredLineCount: number;
  totalLineCount: number;
  onReconnect: () => void;
  onOpenMenu: () => void;
}

/**
 * Header bar with status, search, pod/tail selectors, and menu.
 */
export function LogsHeader({
  status,
  selectedPod,
  pods,
  onSelectPod,
  selectedTail,
  onSelectTail,
  follow,
  onToggleFollow,
  search,
  onSearchChange,
  filteredLineCount,
  totalLineCount,
  onReconnect,
  onOpenMenu,
}: LogsHeaderProps) {
  const getStatusDisplay = () => {
    const label =
      status.kind === "live"
        ? "Live"
        : status.kind === "reconnecting"
          ? `Reconnecting in ${Math.ceil(status.nextRetryMs / 1000)}s`
          : status.kind === "ended"
            ? "Ended"
            : status.kind === "pod-gone"
              ? "Pod gone"
              : status.kind === "error"
                ? "Error"
                : status.kind === "paused"
                  ? "Paused"
                  : "Loading…";
    const color =
      status.kind === "live"
        ? "text-pier-status-running-text"
        : status.kind === "reconnecting"
          ? "text-pier-status-building-text"
          : ["ended", "pod-gone", "error"].includes(status.kind)
            ? "text-pier-status-failed-text"
            : "text-pier-muted";
    return { label, color };
  };

  const { label: statusLabel, color: statusColor } = getStatusDisplay();

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-pier-border bg-pier-surface-2 text-sm flex-wrap">
      {/* Status indicator */}
      <span className="text-[13px]">●</span>
      <span className={`text-[13px] font-medium ${statusColor}`}>{statusLabel}</span>

      {/* Search bar */}
      <Input
        type="search"
        placeholder="Search logs…"
        value={search}
        onChange={(e) => onSearchChange(e.currentTarget.value)}
        className="h-7 px-2 text-[12px] flex-1 min-w-[120px] max-w-xs"
      />
      {search && (
        <span className="text-[11px] text-pier-muted">
          {filteredLineCount} / {totalLineCount}
        </span>
      )}

      {/* Retry buttons */}
      {status.kind === "reconnecting" && (
        <Button variant="ghost" size="sm" onClick={onReconnect}>
          Retry
        </Button>
      )}
      {status.kind === "pod-gone" && (
        <Button variant="ghost" size="sm" onClick={onReconnect}>
          Use newest pod
        </Button>
      )}
      {status.kind === "error" && (
        <Button variant="ghost" size="sm" onClick={onReconnect}>
          Retry
        </Button>
      )}

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* Controls */}
      <div className="flex items-center gap-2">
        <select
          aria-label="Pod"
          value={selectedPod}
          onChange={(e) => onSelectPod(e.currentTarget.value)}
          className="h-7 px-2 text-[12px] bg-pier-bg text-pier-fg border border-pier-border rounded-pier"
        >
          {pods.map((pod) => (
            <option key={pod.name} value={pod.name}>
              {pod.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Tail size"
          value={selectedTail}
          onChange={(e) => onSelectTail(Number(e.currentTarget.value))}
          className="h-7 px-2 text-[12px] bg-pier-bg text-pier-fg border border-pier-border rounded-pier"
        >
          <option value={100}>100</option>
          <option value={200}>200</option>
          <option value={1000}>1000</option>
        </select>

        <button
          role="switch"
          aria-checked={follow}
          aria-label="Follow logs"
          onClick={() => onToggleFollow(!follow)}
          className={`px-2.5 h-7 text-[12px] font-medium rounded-pier border transition-colors ${
            follow
              ? "bg-pier-accent-bg border-pier-accent text-pier-accent"
              : "bg-pier-bg border-pier-border text-pier-muted hover:bg-pier-surface"
          }`}
        >
          {follow ? "Follow" : "Paused"}
        </button>

        <button
          aria-label="Log actions"
          onClick={onOpenMenu}
          className="h-7 px-2 text-pier-fg hover:bg-pier-surface rounded-pier text-[13px] font-medium"
        >
          ⋯
        </button>
      </div>
    </div>
  );
}
