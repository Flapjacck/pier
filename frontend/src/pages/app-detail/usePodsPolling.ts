import { useCallback, useEffect, useState } from "react";
import { listAppPods } from "../../api/client";
import type { AppPod } from "../../api/types";
import { useApi } from "../../hooks/useApi";

const POLL_MS = 5_000;

export function usePodsPolling(appName: string) {
  const fetcher = useCallback(
    (signal: AbortSignal) => listAppPods(appName, { signal }),
    [appName],
  );
  const result = useApi(fetcher, [appName]);
  const { refetch } = result;
  const [poll, setPoll] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setPoll((value) => value + 1);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (poll > 0) refetch();
  }, [poll, refetch]);

  return { ...result, pods: result.data as AppPod[] | undefined };
}
