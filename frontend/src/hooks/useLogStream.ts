import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/errors";
import { getAppLogsText } from "../api/client";
import { LogBuffer } from "../lib/logBuffer";
import { useEventSourceManager } from "./useEventSourceLogs";

export type LogStreamStatus =
  | { kind: "loading" }
  | { kind: "live" }
  | { kind: "reconnecting"; attempt: number; nextRetryMs: number }
  | { kind: "ended" }
  | { kind: "pod-gone" }
  | { kind: "error"; message: string }
  | { kind: "static" };

export interface UseLogStreamOptions {
  name: string;
  pod?: string;
  tail?: number;
  follow?: boolean;
}

interface UseLogStreamResult {
  lines: Array<{ id: number; text: string }>;
  status: LogStreamStatus;
  droppedCount: number;
  clear: () => void;
  reconnectNow: () => void;
}

export function useLogStream({
  name,
  pod,
  tail = 200,
  follow = true,
}: UseLogStreamOptions): UseLogStreamResult {
  const [lines, setLines] = useState<Array<{ id: number; text: string }>>([]);
  const [status, setStatus] = useState<LogStreamStatus>({ kind: "loading" });
  const [droppedCount, setDroppedCount] = useState(0);

  const bufferRef = useRef<LogBuffer>(new LogBuffer());
  const pendingLinesRef = useRef<string[]>([]);
  const rafRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { connect, scheduleReconnect, cleanup: cleanupES, closeEventSource } =
    useEventSourceManager();

  const scheduleFlush = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (pendingLinesRef.current.length === 0) return;
      const newLines = pendingLinesRef.current;
      pendingLinesRef.current = [];
      const dropped = bufferRef.current.append(newLines);
      if (dropped > 0) {
        setDroppedCount((prev) => prev + dropped);
      }
      setLines(bufferRef.current.getLines());
    });
  }, []);

  const clear = useCallback(() => {
    bufferRef.current.clear();
    setLines([]);
    setDroppedCount(0);
    pendingLinesRef.current = [];
  }, []);

  const handleReconnect = useCallback(
    (attempt: number, nextRetryMs: number) => {
      setStatus({ kind: "reconnecting", attempt, nextRetryMs });
      scheduleReconnect(attempt, {
        onOpen: () => setStatus({ kind: "live" }),
        onLine: () => {},
        onEnded: () => setStatus({ kind: "ended" }),
        onError: (msg) => setStatus({ kind: "error", message: msg }),
        onPodGone: () => setStatus({ kind: "pod-gone" }),
        onReconnect: handleReconnect,
      });
    },
    [scheduleReconnect],
  );

  const reconnectNow = useCallback(() => {
    reconnectAttemptRef.current = 0;
    if (follow) {
      connect(name, pod, tail, {
        onOpen: () => setStatus({ kind: "live" }),
        onLine: (line) => {
          pendingLinesRef.current.push(line);
          scheduleFlush();
        },
        onEnded: () => {
          // Flush pending lines before ending
          if (pendingLinesRef.current.length > 0) {
            const newLines = pendingLinesRef.current;
            pendingLinesRef.current = [];
            bufferRef.current.append(newLines);
            setLines(bufferRef.current.getLines());
          }
          setStatus({ kind: "ended" });
        },
        onError: () => {
          if (pendingLinesRef.current.length > 0) {
            const newLines = pendingLinesRef.current;
            pendingLinesRef.current = [];
            bufferRef.current.append(newLines);
            setLines(bufferRef.current.getLines());
          }
          handleReconnect(0, 1000);
        },
        onPodGone: () => {
          if (pendingLinesRef.current.length > 0) {
            const newLines = pendingLinesRef.current;
            pendingLinesRef.current = [];
            bufferRef.current.append(newLines);
            setLines(bufferRef.current.getLines());
          }
          setStatus({ kind: "pod-gone" });
        },
        onReconnect: handleReconnect,
      });
    }
  }, [name, pod, tail, follow, connect, handleReconnect, scheduleFlush]);

  useEffect(() => {
    clear();
    pendingLinesRef.current = [];

    if (follow) {
      reconnectNow();
    } else {
      // Static mode: fetch text logs once
      setStatus({ kind: "loading" });
      const controller = new AbortController();
      abortControllerRef.current = controller;

      getAppLogsText(name, { pod, tail }, { signal: controller.signal })
        .then((text) => {
          if (controller.signal.aborted) return;
          const splitLines = text.split(/\r?\n/).filter((line) => line.length > 0);
          const dropped = bufferRef.current.append(splitLines);
          setDroppedCount(dropped);
          setLines(bufferRef.current.getLines());
          setStatus({ kind: "static" });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof ApiError) {
            if (err.kind === "not_found") {
              setStatus({ kind: "pod-gone" });
            } else {
              setStatus({
                kind: "error",
                message: err.message || "Failed to load logs",
              });
            }
          } else {
            setStatus({
              kind: "error",
              message: "Failed to load logs",
            });
          }
        });
    }

    return () => {
      closeEventSource();
      cleanupES();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- explicit deps
  }, [name, pod, tail, follow]);

  return {
    lines,
    status,
    droppedCount,
    clear,
    reconnectNow,
  };
}
