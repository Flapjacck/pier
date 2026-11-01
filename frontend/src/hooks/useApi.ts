import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/errors";

type UseApiResult<T> = {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
  refetch: () => void;
};

/**
 * Minimal data hook: aborts in-flight requests on unmount or when deps change.
 */
export function useApi<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): UseApiResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const id = ++generation.current;
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);

    void fetcher(controller.signal)
      .then((value) => {
        if (generation.current !== id) return;
        setData(value);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (generation.current !== id || controller.signal.aborted) return;
        setError(err instanceof ApiError ? err : ApiError.network(err));
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- explicit dep list from caller
  }, [fetcher, tick, ...deps]);

  const refetch = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  return { data, error, loading, refetch };
}
