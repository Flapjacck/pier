import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "./Button";
import { Input } from "./Input";
import { LogPanel } from "./LogPanel";
import { StatusBadge } from "./StatusBadge";
import type { LogStreamStatus } from "../../hooks/useLogStream";
import { useToast } from "./Toast";

export interface LogViewerProps {
  podName: string;
  lines: Array<{ id: number; text: string }>;
  status: LogStreamStatus;
  droppedCount: number;
  onClear: () => void;
  onReconnectNow?: () => void;
}

/**
 * Reusable log viewer panel with auto-scroll, filter, copy, and download.
 * ≤250 lines per the style guide.
 */
export function LogViewer({
  podName,
  lines,
  status,
  droppedCount,
  onClear,
  onReconnectNow,
}: LogViewerProps) {
  const [filter, setFilter] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [jumpCount, setJumpCount] = useState(0);

  const deferredFilter = useDeferredValue(filter);
  const { push: toast } = useToast();
  const panelRef = useRef<HTMLDivElement>(null);

  // Derive filtered lines
  const filteredLines = useMemo(() => {
    if (!deferredFilter) return lines;
    const lower = deferredFilter.toLowerCase();
    return lines.filter((line) => line.text.toLowerCase().includes(lower));
  }, [lines, deferredFilter]);

  // Update jump count when scrolled up
  const handleScroll = () => {
    if (!panelRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = panelRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight <= 24;

    if (isNearBottom) {
      setAutoScroll(true);
      setJumpCount(0);
    } else {
      setAutoScroll(false);
      const newCount = Math.max(0, lines.length - filteredLines.length);
      setJumpCount(newCount);
    }
  };

  // Auto-scroll on new lines
  useEffect(() => {
    if (!autoScroll || !panelRef.current) return;
    const panel = panelRef.current;
    panel.scrollTop = panel.scrollHeight;
  }, [filteredLines, autoScroll]);

  const handleJumpToLatest = () => {
    setAutoScroll(true);
    setJumpCount(0);
    if (panelRef.current) {
      const panel = panelRef.current;
      panel.scrollTop = panel.scrollHeight;
    }
  };

  const handleCopy = async () => {
    try {
      const text = filteredLines.map((line) => line.text).join("\n");
      await navigator.clipboard.writeText(text);
      toast({ variant: "success", title: "Copied to clipboard" });
    } catch {
      toast({ variant: "error", title: "Failed to copy" });
    }
  };

  const handleDownload = () => {
    try {
      const text = filteredLines.map((line) => line.text).join("\n");
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const now = new Date();
      const date = now.toISOString().slice(0, 19).replace(/:/g, "-");
      a.href = url;
      a.download = `logs-${podName}-${date}.log`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ variant: "success", title: "Downloaded" });
    } catch {
      toast({ variant: "error", title: "Failed to download" });
    }
  };

  const isLoading = status.kind === "loading";

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap items-center">
        <Input
          type="search"
          placeholder="Filter logs…"
          value={filter}
          onChange={(e) => setFilter(e.currentTarget.value)}
          className="max-w-xs"
        />
        {filter && (
          <span className="text-[12px] text-pier-muted">
            {filteredLines.length} / {lines.length}
          </span>
        )}

        <div className="flex gap-1 ml-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopy}
            disabled={lines.length === 0}
          >
            Copy
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownload}
            disabled={lines.length === 0}
          >
            Download
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClear}
            disabled={lines.length === 0}
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Status */}
      <StatusBadge status={status} onReconnect={onReconnectNow} />

      {/* Log panel */}
      <div
        ref={panelRef}
        className="flex-1 min-h-0 border border-pier-border rounded-pier-lg overflow-hidden"
        onScroll={handleScroll}
      >
        <LogPanel
          filteredLines={filteredLines}
          allLines={lines}
          isLoading={isLoading}
          jumpCount={jumpCount}
          onJumpToLatest={handleJumpToLatest}
          droppedCount={droppedCount}
          podName={podName}
        />
      </div>
    </div>
  );
}
