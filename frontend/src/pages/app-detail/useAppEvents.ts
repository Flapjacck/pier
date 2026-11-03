import { useCallback, useEffect, useState } from "react";
import { listAppEvents } from "../../api/client";
import { useApi } from "../../hooks/useApi";

export function useAppEvents(appName: string) {
  const fetcher = useCallback(
    (signal: AbortSignal) => listAppEvents(appName, { signal }),
    [appName],
  );
  const result = useApi(fetcher, [appName]);
  const { refetch } = result;
  const [poll, setPoll] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setPoll((value) => value + 1);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (poll > 0) refetch();
  }, [poll, refetch]);
  return result;
}
