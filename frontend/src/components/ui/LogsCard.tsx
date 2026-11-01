import { useMemo, useLayoutEffect, useRef, useState } from "react";
import type { AppPod } from "../../api/types";
import type { LogLine, LogStreamStatus } from "../../hooks/useLogStream";
import { Button } from "./Button";
import { Input } from "./Input";
import { Skeleton } from "./Skeleton";
import { useToast } from "./Toast";

interface LogsCardProps {
  appName: string;
  pods: AppPod[];
  selectedPod: string;
  onSelectPod: (pod: string) => void;
  selectedTail: number;
  onSelectTail: (tail: number) => void;
  follow: boolean;
  onToggleFollow: (on: boolean) => void;
  lines: LogLine[];
  status: LogStreamStatus;
  droppedCount: number;
  reconnectNow: () => void;
}

/**
 * Complete log viewer card with header bar, auto-scroll, and actions menu.
 * Handles layout, scroll logic, and copy/download actions.
 */
export function LogsCard({
  appName,
  pods,
  selectedPod,
  onSelectPod,
  selectedTail,
  onSelectTail,
  follow,
  onToggleFollow,
  lines,
  status,
  droppedCount,
  reconnectNow,
}: LogsCardProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevLineCountRef = useRef(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [newLineCount, setNewLineCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { push: toast } = useToast();

  // Filter lines by search term (case-insensitive)
  const filteredLines = useMemo(() => {
    if (!search) return lines;
    const lower = search.toLowerCase();
    return lines.filter((line) => line.text.toLowerCase().includes(lower));
  }, [lines, search]);

  const isLoading = status.kind === "loading";

  // Auto-scroll on new lines (but not while paused)
  useLayoutEffect(() => {
    const added = lines.length - prevLineCountRef.current;
    prevLineCountRef.current = lines.length;

    if (!autoScroll && added > 0) {
      setNewLineCount((prev) => prev + added);
    } else if (autoScroll && panelRef.current) {
      const panel = panelRef.current;
      panel.scrollTop = panel.scrollHeight;
      setNewLineCount(0);
    }
  }, [lines, autoScroll]);

  const handleScroll = () => {
    if (!panelRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = panelRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight <= 24;

    if (isNearBottom && !autoScroll) {
      setAutoScroll(true);
      setNewLineCount(0);
    } else if (!isNearBottom && autoScroll) {
      setAutoScroll(false);
    }
  };

  const handleJumpToLatest = () => {
    setAutoScroll(true);
    setNewLineCount(0);
    if (panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
    }
  };

  const handleCopy = async () => {
    try {
      const text = lines.map((line) => line.text).join("\n");
      await navigator.clipboard.writeText(text);
      toast({ variant: "success", title: "Copied to clipboard" });
    } catch {
      toast({ variant: "error", title: "Failed to copy" });
    }
  };

  const handleDownload = () => {
    try {
      const text = lines.map((line) => line.text).join("\n");
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const now = new Date();
      const date = now.toISOString().slice(0, 19).replace(/:/g, "-");
      a.href = url;
      a.download = `${appName}-${selectedPod}-${date}.log`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ variant: "success", title: "Downloaded" });
    } catch {
      toast({ variant: "error", title: "Failed to download" });
    }
  };

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
    <div className="rounded-pier-lg border border-pier-border overflow-hidden flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-pier-border bg-pier-surface-2 text-sm flex-wrap">
        {/* Status and reconnect actions */}
        <span className="text-[13px]">●</span>
        <span className={`text-[13px] font-medium ${statusColor}`}>{statusLabel}</span>

        {/* Search bar */}
        <Input
          type="search"
          placeholder="Search logs…"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          className="h-7 px-2 text-[12px] flex-1 min-w-[120px] max-w-xs"
        />
        {search && (
          <span className="text-[11px] text-pier-muted">
            {filteredLines.length} / {lines.length}
          </span>
        )}

        {status.kind === "reconnecting" && (
          <Button variant="ghost" size="sm" onClick={reconnectNow}>
            Retry
          </Button>
        )}

        {status.kind === "pod-gone" && (
          <Button variant="ghost" size="sm" onClick={reconnectNow}>
            Use newest pod
          </Button>
        )}

        {status.kind === "error" && (
          <Button variant="ghost" size="sm" onClick={reconnectNow}>
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

          <div className="relative">
            <button
              aria-label="Log actions menu"
              onClick={() => setMenuOpen(!menuOpen)}
              className="h-7 px-2 text-pier-fg hover:bg-pier-surface rounded-pier text-[13px] font-medium"
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-50 mt-1 w-28 bg-pier-bg border border-pier-border rounded-pier shadow-lg">
                <button
                  onClick={() => {
                    handleCopy();
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-pier-surface"
                >
                  Copy
                </button>
                <button
                  onClick={() => {
                    handleDownload();
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-pier-surface"
                >
                  Download
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Log panel */}
      <div
        ref={panelRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-pier-log-bg text-pier-log-fg font-mono text-[12px] leading-relaxed"
        role="log"
        aria-label={`Logs for ${selectedPod}`}
        tabIndex={0}
      >
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : lines.length === 0 ? (
          <div className="flex items-center justify-center h-full text-pier-log-muted">
            <p className="text-[13px]">Waiting for logs…</p>
          </div>
        ) : filteredLines.length === 0 ? (
          <div className="flex items-center justify-center h-full text-pier-log-muted">
            <p className="text-[13px]">No matching lines</p>
          </div>
        ) : (
          <pre className="p-4 m-0 whitespace-pre-wrap break-words">
            {droppedCount > 0 && (
              <div className="text-pier-log-muted mb-2">
                [Showing last {lines.length} lines]
              </div>
            )}
            {filteredLines.map((line) => (
              <div key={line.n} className="flex">
                <span className="w-12 text-right text-pier-log-muted pr-3 select-none">
                  {line.n}
                </span>
                <span>{line.text}</span>
              </div>
            ))}
          </pre>
        )}

        {/* New lines indicator */}
        {newLineCount > 0 && (
          <button
            onClick={handleJumpToLatest}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 px-3 py-1 text-[12px] font-medium rounded-full bg-pier-accent-bg text-pier-accent border border-pier-accent"
          >
            ↓ {newLineCount} new {newLineCount === 1 ? "line" : "lines"}
          </button>
        )}
      </div>
    </div>
  );
}
