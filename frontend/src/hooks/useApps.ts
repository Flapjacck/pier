import { useCallback, useEffect, useRef, useState } from "react";
import { listApps as apiListApps } from "../api/client";
import { ApiError } from "../api/errors";
import type { App } from "../api/types";

type UseAppsResult = {
  apps: App[];
  error: ApiError | undefined;
  loading: boolean;
  refetch: () => void;
  lastUpdated: Date | undefined;
};

const REFRESH_INTERVAL = 10000; // 10 seconds

/**
 * Fetches and auto-refreshes the apps list.
 *
 * - Loads initially with `loading = true`
 * - Retries on failure (shows error while keeping stale data if available)
 * - Auto-refreshes every 10s when the tab is visible and no request is in flight
 * - Full cleanup on unmount (clears timers, aborts in-flight requests)
 */
export function useApps(): UseAppsResult {
  const [apps, setApps] = useState<App[]>([]);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>(undefined);
  const [refreshTick, setRefreshTick] = useState(0);

  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestInFlightRef = useRef(false);

  // Core fetch logic
  const performFetch = useCallback(
    async (signal: AbortSignal) => {
      requestInFlightRef.current = true;
      try {
        const data = await apiListApps({ signal });
        setApps(data);
        setError(undefined);
        setLastUpdated(new Date());
        setLoading(false);
      } catch (err: unknown) {
        if (signal.aborted) return;
        const apiErr = err instanceof ApiError ? err : ApiError.network(err);
        setError(apiErr);
        setLoading(false);
      } finally {
        requestInFlightRef.current = false;
      }
    },
    [],
  );

  // Fetch on mount and when refreshTick changes
  useEffect(() => {
    ++generationRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;

    void performFetch(controller.signal);

    return () => {
      controller.abort();
    };
  }, [performFetch, refreshTick]);

  // Auto-refresh timer: only when visible and no request in flight
  useEffect(() => {
    const scheduleRefresh = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        if (
          !requestInFlightRef.current &&
          document.visibilityState === "visible"
        ) {
          setRefreshTick((n) => n + 1);
        } else if (document.visibilityState === "visible") {
          // Still in flight; reschedule
          scheduleRefresh();
        }
      }, REFRESH_INTERVAL);
    };

    // Only auto-refresh if data is loaded
    if (!loading) {
      scheduleRefresh();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !loading && !timerRef.current) {
        scheduleRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loading]);

  const refetch = useCallback(() => {
    setRefreshTick((n) => n + 1);
  }, []);

  return { apps, error, loading, refetch, lastUpdated };
}
