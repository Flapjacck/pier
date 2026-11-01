import { useLayoutEffect, useRef, useState } from "react";
import { Skeleton } from "../ui/Skeleton";
import type { LogLine, LogStreamStatus } from "../../hooks/useLogStream";

interface LogsPanelProps {
  lines: LogLine[];
  filteredLines: LogLine[];
  status: LogStreamStatus;
  selectedPod: string;
  autoScroll: boolean;
  onAutoScrollChange: (scroll: boolean) => void;
}

/**
 * Scrollable logs panel with line numbers and auto-scroll.
 * Keeps an internal ref of the last seen line number to count new lines accurately.
 */
export function LogsPanel({
  lines,
  filteredLines,
  status,
  selectedPod,
  autoScroll,
  onAutoScrollChange,
}: LogsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevLineCountRef = useRef(0);
  const lastSeenNRef = useRef(0);
  const [newLineCount, setNewLineCount] = useState(0);

  const isLoading = status.kind === "loading";

  // Auto-scroll on new lines (but not while paused)
  useLayoutEffect(() => {
    const added = lines.length - prevLineCountRef.current;
    prevLineCountRef.current = lines.length;

    if (!autoScroll && added > 0) {
      // Count new lines based on line.n, not just count delta
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        const newCount = Math.max(0, lastLine.n - lastSeenNRef.current);
        setNewLineCount(newCount);
      }
    } else if (autoScroll && panelRef.current) {
      const panel = panelRef.current;
      panel.scrollTop = panel.scrollHeight;
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        lastSeenNRef.current = lastLine.n;
      }
      setNewLineCount(0);
    }
  }, [lines, autoScroll]);

  const handleScroll = () => {
    if (!panelRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = panelRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight <= 24;

    if (isNearBottom && !autoScroll) {
      onAutoScrollChange(true);
    } else if (!isNearBottom && autoScroll) {
      onAutoScrollChange(false);
    }
  };

  const handleJumpToLatest = () => {
    onAutoScrollChange(true);
    if (panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
    }
  };

  return (
    <div
      ref={panelRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto bg-pier-log-bg text-pier-log-fg font-mono text-[12px] leading-relaxed relative"
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

      {/* New lines pill: positioned absolutely inside the panel */}
      {newLineCount > 0 && (
        <button
          onClick={handleJumpToLatest}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 text-[12px] font-medium rounded-full bg-pier-accent-bg text-pier-accent border border-pier-accent"
        >
          ↓ {newLineCount} new {newLineCount === 1 ? "line" : "lines"}
        </button>
      )}
    </div>
  );
}
