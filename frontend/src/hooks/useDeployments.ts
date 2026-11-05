import { useCallback, useEffect, useRef, useState } from "react";
import { listDeployments } from "../api/client";
import { ApiError } from "../api/errors";
import type { DeployPage, DeploySummary } from "../api/types";

export const DEPLOYS_PAGE_SIZE = 20;
export const DEPLOYS_REFRESH_MS = 5000;

type UseDeploymentsResult = {
  deployments: DeploySummary[];
  error: ApiError | undefined;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
};

const toApiError = (err: unknown) => (err instanceof ApiError ? err : ApiError.network(err));

type State = { deployments: DeploySummary[]; nextBefore: number | null };

/** Merge a fresh first page into what is loaded, keeping older pages loaded by loadMore. */
function mergeFirstPage(prev: State, page: DeployPage): State {
  if (prev.deployments.length <= page.deployments.length) return page;
  const oldest = page.deployments.at(-1)?.id;
  if (oldest === undefined) return page;
  return { deployments: [...page.deployments, ...prev.deployments.filter((d) => d.id < oldest)], nextBefore: prev.nextBefore };
}

/**
 * Deploy history of one app, newest first. loadMore appends older pages; while any listed
 * deploy is running the first page is refreshed every 5 s.
 */
export function useDeployments(name: string): UseDeploymentsResult {
  const [state, setState] = useState<State>({ deployments: [], nextBefore: null });
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tick, setTick] = useState(0);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const moreInFlight = useRef(false);

  useEffect(() => {
    const id = ++generation.current;
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    moreInFlight.current = false;
    setLoadingMore(false);
    setLoading(true);
    setError(undefined);
    listDeployments(name, { limit: DEPLOYS_PAGE_SIZE }, { signal: ctrl.signal })
      .then((page) => {
        if (generation.current !== id) return;
        setState(page);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (generation.current !== id || ctrl.signal.aborted) return;
        setState({ deployments: [], nextBefore: null });
        setError(toApiError(err));
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [name, tick]);

  const anyRunning = state.deployments.some((d) => d.status === "running");
  useEffect(() => {
    if (!anyRunning || loading) return;
    const id = generation.current;
    const ctrl = controller.current;
    const timer = setTimeout(() => {
      listDeployments(name, { limit: DEPLOYS_PAGE_SIZE }, { signal: ctrl?.signal })
        .then((page) => {
          if (generation.current === id) setState((prev) => mergeFirstPage(prev, page));
        })
        .catch((err: unknown) => {
          if (generation.current === id && !ctrl?.signal.aborted) setError(toApiError(err));
        });
    }, DEPLOYS_REFRESH_MS);
    return () => clearTimeout(timer);
  }, [name, anyRunning, loading, state]);

  const loadMore = useCallback(() => {
    if (state.nextBefore === null || moreInFlight.current) return;
    const id = generation.current;
    const ctrl = controller.current;
    moreInFlight.current = true;
    setLoadingMore(true);
    setError(undefined);
    listDeployments(name, { limit: DEPLOYS_PAGE_SIZE, before: state.nextBefore }, { signal: ctrl?.signal })
      .then((page) => {
        if (generation.current !== id) return;
        setState((prev) => ({ deployments: [...prev.deployments, ...page.deployments], nextBefore: page.nextBefore }));
      })
      .catch((err: unknown) => {
        if (generation.current !== id || ctrl?.signal.aborted) return;
        setError(toApiError(err));
      })
      .finally(() => {
        if (generation.current !== id) return;
        moreInFlight.current = false;
        setLoadingMore(false);
      });
  }, [name, state.nextBefore]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  return {
    deployments: state.deployments,
    error,
    loading,
    loadingMore,
    hasMore: state.nextBefore !== null,
    loadMore,
    refetch,
  };
}
