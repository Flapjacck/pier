import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/errors";
import { appLogsUrl, getAppLogsText } from "../api/client";
import { LogBuffer } from "../lib/logBuffer";
import type { LogLine } from "../lib/logBuffer";

export type { LogLine };

export type LogStreamStatus =
  | { kind: "loading" }
  | { kind: "live" }
  | { kind: "reconnecting"; attempt: number; nextRetryMs: number }
  | { kind: "ended" }
  | { kind: "pod-gone" }
  | { kind: "error"; message: string }
  | { kind: "paused" };

export interface UseLogStreamOptions {
  name: string;
  pod: string | undefined; // undefined means wait for pod to be known
  tail?: number;
  follow?: boolean;
}

interface UseLogStreamResult {
  lines: LogLine[];
  status: LogStreamStatus;
  droppedCount: number;
  reconnectNow: () => void;
}

/** Exponential backoff: 1s → 2s → 4s → ... → 30s, with ±20% jitter. */
function getBackoffMs(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt), 30000);
  const jitter = base * 0.2 * (Math.random() - 0.5);
  return base + jitter;
}

export function useLogStream({
  name,
  pod,
  tail = 200,
  follow = true,
}: UseLogStreamOptions): UseLogStreamResult {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<LogStreamStatus>({ kind: "loading" });
  const [droppedCount, setDroppedCount] = useState(0);

  const bufferRef = useRef(new LogBuffer());
  const reconnectNowRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Don't start until pod is known
    if (!pod) {
      setStatus({ kind: "loading" });
      return;
    }

    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let rafPending: number | null = null;
    let pendingLines: string[] = [];
    const abortController = new AbortController();

    // Flush pending lines to state (once per rAF)
    const flushLines = () => {
      if (cancelled || pendingLines.length === 0) return;
      const linesToFlush = pendingLines;
      pendingLines = [];
      const { lines: newLines, dropped } = bufferRef.current.append(linesToFlush);
      if (!cancelled) {
        if (dropped > 0) setDroppedCount((p) => p + dropped);
        setLines(newLines);
      }
    };

    const scheduleFlush = () => {
      if (rafPending !== null) return;
      rafPending = requestAnimationFrame(() => {
        rafPending = null;
        flushLines();
      });
    };

    const closeEventSource = () => {
      if (es) {
        es.close();
        es = null;
      }
    };

    const pushDivider = () => {
      // Add a visual divider line on reconnect
      const droppedText = droppedCount > 0 ? ` (${droppedCount} lines dropped)` : '';
      pendingLines.push(`[Reconnected, showing last ${bufferRef.current.getLines().length} lines${droppedText}]`);
      scheduleFlush();
    };

    // Probe to classify connection errors
    const probeError = (onClassified: (isPodGone: boolean) => void) => {
      getAppLogsText(name, { pod, tail: 1 }, { signal: abortController.signal })
        .then(() => {
          if (!cancelled) onClassified(false); // Transient error
        })
        .catch((err) => {
          if (!cancelled && err instanceof ApiError && err.kind === "not_found") {
            onClassified(true); // Pod is gone
          } else if (!cancelled) {
            onClassified(false); // Treat other errors as transient
          }
        });
    };

    // Retry with backoff
    const retry = (attempt: number) => {
      if (cancelled) return;
      const nextRetryMs = getBackoffMs(attempt);
      setStatus({ kind: "reconnecting", attempt, nextRetryMs });
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        if (!cancelled) {
          pushDivider();
          open(attempt + 1);
        }
      }, nextRetryMs) as unknown as number;
    };

    // Open EventSource or static fetch
    const open = (_attempt: number) => {
      if (cancelled) return;

      if (follow) {
        closeEventSource();
        es = new EventSource(appLogsUrl(name, { follow: true, pod, tail }));

        es.addEventListener("open", () => {
          if (!cancelled) setStatus({ kind: "live" });
        });

        es.addEventListener("message", (event: MessageEvent) => {
          if (!cancelled) {
            const line = event.data as string;
            if (line) {
              pendingLines.push(line);
              scheduleFlush();
            }
          }
        });

        es.addEventListener("error", (event: Event) => {
          if (cancelled || !es) return;

          // Custom error from backend (instanceof MessageEvent)?
          if (event instanceof MessageEvent) {
            closeEventSource();
            flushLines();
            retry(0);
            return;
          }

          // Native connection error: classify and retry or show terminal state
          closeEventSource();
          flushLines();
          probeError((isPodGone) => {
            if (!cancelled) {
              if (isPodGone) {
                setStatus({ kind: "pod-gone" });
              } else {
                retry(0);
              }
            }
          });
        });

        // Custom 'end' event from backend
        es.addEventListener("end", () => {
          if (!cancelled) {
            closeEventSource();
            flushLines();
            setStatus({ kind: "ended" });
          }
        });
      } else {
        // Static mode: one fetch
        setStatus({ kind: "loading" });
        getAppLogsText(name, { pod, tail }, { signal: abortController.signal })
          .then((text) => {
            if (cancelled) return;
            const splitLines = text.split(/\r?\n/).filter((line) => line.length > 0);
            const { lines: newLines, dropped } = bufferRef.current.append(splitLines);
            setLines(newLines);
            if (dropped > 0) setDroppedCount(dropped);
            setStatus({ kind: "paused" });
          })
          .catch((err) => {
            if (!cancelled && err instanceof ApiError) {
              if (err.kind === "not_found") {
                setStatus({ kind: "pod-gone" });
              } else {
                setStatus({ kind: "error", message: err.message || "Failed to load logs" });
              }
            } else if (!cancelled) {
              setStatus({ kind: "error", message: "Failed to load logs" });
            }
          });
      }
    };

    reconnectNowRef.current = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      open(0);
    };

    bufferRef.current.clear();
    setDroppedCount(0);
    setLines([]);
    open(0);

    return () => {
      cancelled = true;
      closeEventSource();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (rafPending !== null) cancelAnimationFrame(rafPending);
      abortController.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- droppedCount is state, not a dep
  }, [name, pod, tail, follow]);

  return {
    lines,
    status,
    droppedCount,
    reconnectNow: () => reconnectNowRef.current?.(),
  };
}
