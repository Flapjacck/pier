import type { CSSProperties } from "react";
import { useRef } from "react";
import { cn } from "../../lib/cn";
import { Skeleton } from "./Skeleton";

interface LogPanelProps {
  filteredLines: Array<{ id: number; text: string }>;
  allLines: Array<{ id: number; text: string }>;
  isLoading: boolean;
  jumpCount: number;
  onJumpToLatest: () => void;
  droppedCount: number;
  podName: string;
}

/**
 * Reusable log panel: renders filtered lines in a scrollable dark container.
 * ≤250 lines, extracted from LogViewer for modularity.
 */
export function LogPanel({
  filteredLines,
  allLines,
  isLoading,
  jumpCount,
  onJumpToLatest,
  droppedCount,
  podName,
}: LogPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex-1 min-h-0 relative">
      {isLoading ? (
        <div className="p-4 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : filteredLines.length === 0 ? (
        <div className="flex items-center justify-center h-full text-pier-muted">
          <p className="text-[13px]">
            {allLines.length === 0 ? "Waiting for logs…" : "No matching lines"}
          </p>
        </div>
      ) : (
        <>
          <div
            ref={panelRef}
            className={cn(
              "absolute inset-0 overflow-y-auto",
              "bg-pier-gray-950 dark:bg-pier-gray-950",
              "text-[#E0E0E0] dark:text-[#E0E0E0]",
            )}
            role="log"
            aria-label={`Logs for ${podName}`}
            tabIndex={0}
            style={
              {
                "--log-surface": "#0A0A0A",
                "--log-text": "#E0E0E0",
              } as CSSProperties
            }
          >
            <pre
              className={cn(
                "font-mono text-[12px] leading-normal",
                "p-4 whitespace-pre-wrap word-break: break-word",
                "m-0",
              )}
              style={{
                fontFamily:
                  "'JetBrains Mono Variable', ui-monospace, monospace",
                lineHeight: 1.5,
              }}
            >
              {filteredLines.map((line) => (
                <div key={line.id} className="flex">
                  <span className="w-12 text-right text-pier-gray-600 pr-3 select-none">
                    {allLines.findIndex((l) => l.id === line.id) + 1}
                  </span>
                  <span>{line.text}</span>
                </div>
              ))}
            </pre>
          </div>

          {/* Jump to latest button */}
          {jumpCount > 0 && (
            <button
              onClick={onJumpToLatest}
              className={cn(
                "absolute bottom-4 right-4 z-10",
                "px-3 py-2 rounded-pier text-[12px] font-medium",
                "bg-pier-fg text-pier-bg",
                "hover:opacity-80 transition-opacity",
              )}
            >
              Jump to latest ({jumpCount})
            </button>
          )}
        </>
      )}

      {/* Capped notice */}
      {droppedCount > 0 && (
        <div className="absolute top-4 left-4 bg-pier-surface border border-pier-border px-2 py-1 rounded-pier text-[11px] text-pier-muted">
          Showing last {allLines.length} lines
        </div>
      )}
    </div>
  );
}
