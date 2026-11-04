import { useCallback, useEffect, useRef, useState } from "react";
import { listAudit } from "../api/client";
import { ApiError } from "../api/errors";
import type { AuditEntry } from "../api/types";

export const AUDIT_PAGE_SIZE = 50;

type UseAuditLogResult = {
  entries: AuditEntry[];
  error: ApiError | undefined;
  /** First page loading (or reloading after refetch / an app change). */
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
};

const toApiError = (err: unknown) => (err instanceof ApiError ? err : ApiError.network(err));

/**
 * Audit log, newest first, one page at a time. loadMore appends the next older page;
 * refetch (or a different app filter) starts again from the newest entry.
 */
export function useAuditLog(app?: string): UseAuditLogResult {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tick, setTick] = useState(0);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const id = ++generation.current;
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setLoading(true);
    setError(undefined);
    listAudit({ limit: AUDIT_PAGE_SIZE, app }, { signal: ctrl.signal })
      .then((page) => {
        if (generation.current !== id) return;
        setEntries(page.entries);
        setNextBefore(page.nextBefore);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (generation.current !== id || ctrl.signal.aborted) return;
        setEntries([]);
        setNextBefore(null);
        setError(toApiError(err));
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [app, tick]);

  const loadMore = useCallback(() => {
    if (nextBefore === null || loadingMore) return;
    const id = generation.current;
    const ctrl = controller.current;
    setLoadingMore(true);
    setError(undefined);
    listAudit({ limit: AUDIT_PAGE_SIZE, before: nextBefore, app }, { signal: ctrl?.signal })
      .then((page) => {
        if (generation.current !== id) return;
        setEntries((prev) => [...prev, ...page.entries]);
        setNextBefore(page.nextBefore);
      })
      .catch((err: unknown) => {
        if (generation.current !== id || ctrl?.signal.aborted) return;
        setError(toApiError(err));
      })
      .finally(() => {
        if (generation.current === id) setLoadingMore(false);
      });
  }, [app, nextBefore, loadingMore]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  return { entries, error, loading, loadingMore, hasMore: nextBefore !== null, loadMore, refetch };
}
