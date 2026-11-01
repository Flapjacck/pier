import { useCallback, useRef } from "react";
import { ApiError } from "../api/errors";
import { appLogsUrl, getAppLogsText } from "../api/client";

/** Backoff times in milliseconds, with ±20% jitter. */
export function getBackoffMs(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt), 30000);
  const jitter = base * 0.2 * (Math.random() - 0.5);
  return base + jitter;
}

interface EventSourceCallbacks {
  onOpen: () => void;
  onLine: (line: string) => void;
  onEnded: () => void;
  onError: (message: string) => void;
  onPodGone: () => void;
  onReconnect: (attempt: number, nextRetryMs: number) => void;
}

/**
 * Manages EventSource lifecycle for log streaming with reconnection.
 * Caller is responsible for cleanup (call close on unmount/change).
 */
export function useEventSourceManager() {
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const closeEventSource = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  const connect = useCallback(
    (name: string, pod: string | undefined, tail: number, callbacks: EventSourceCallbacks) => {
      closeEventSource();

      const es = new EventSource(appLogsUrl(name, { follow: true, pod, tail }));
      esRef.current = es;

      es.addEventListener("open", () => {
        callbacks.onOpen();
      });

      es.addEventListener("message", (event: MessageEvent) => {
        const line = event.data as string;
        if (line) {
          callbacks.onLine(line);
        }
      });

      es.addEventListener("error", (event: Event) => {
        if (event instanceof MessageEvent) {
          // Custom error from backend
          closeEventSource();
          callbacks.onError("Stream error");
          return;
        }

        // Native connection error; classify it
        if (esRef.current === es) {
          closeEventSource();

          // Probe to classify the error
          const controller = new AbortController();
          getAppLogsText(name, { pod, tail: 1 }, { signal: controller.signal })
            .then(() => {
              callbacks.onReconnect(0, 1000);
            })
            .catch((err: unknown) => {
              if (controller.signal.aborted) return;
              if (err instanceof ApiError) {
                if (err.kind === "not_found") {
                  callbacks.onPodGone();
                } else {
                  callbacks.onReconnect(0, 1000);
                }
              } else {
                callbacks.onReconnect(0, 1000);
              }
            });
        }
      });

      es.addEventListener("end", () => {
        closeEventSource();
        callbacks.onEnded();
      });
    },
    [closeEventSource],
  );

  const scheduleReconnect = useCallback(
    (attempt: number, callbacks: EventSourceCallbacks) => {
      const nextRetryMs = getBackoffMs(attempt);
      callbacks.onReconnect(attempt, nextRetryMs);

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
      }, nextRetryMs) as unknown as number;
    },
    [],
  );

  const cleanup = useCallback(() => {
    closeEventSource();
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, [closeEventSource]);

  return { connect, scheduleReconnect, cleanup, closeEventSource };
}
