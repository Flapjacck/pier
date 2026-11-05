import { useCallback, useEffect, useState } from "react";
import { deploymentStreamUrl, getDeployment } from "../api/client";
import { parseDeployDetail } from "../api/deployGuards";
import { ApiError } from "../api/errors";
import type { DeployDetail } from "../api/types";

export const DEPLOY_POLL_MS = 3000;

type UseDeploymentResult = {
  deployment: DeployDetail | undefined;
  error: ApiError | undefined;
  loading: boolean;
  refetch: () => void;
};

const toApiError = (err: unknown) => (err instanceof ApiError ? err : ApiError.network(err));

/**
 * One deploy with its steps. While it is running, follows the SSE stream and replaces the
 * state on every `deployment` frame; closes on `end`. If the stream fails it polls the
 * detail every 3 s until the deploy finishes. Pass id undefined to load nothing.
 */
export function useDeployment(name: string, id: number | undefined): UseDeploymentResult {
  const [deployment, setDeployment] = useState<DeployDetail | undefined>(undefined);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [loading, setLoading] = useState(id !== undefined);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setDeployment(undefined);
    setError(undefined);
    if (id === undefined) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    const closeStream = () => {
      es?.close();
      es = null;
    };
    const apply = (next: DeployDetail) => {
      setDeployment(next);
      setError(undefined);
      if (next.status !== "running") {
        done = true;
        closeStream();
      }
    };
    const poll = () => {
      pollTimer = setTimeout(() => {
        getDeployment(name, id, { signal: ctrl.signal })
          .then(apply)
          .catch((err: unknown) => {
            if (!ctrl.signal.aborted) setError(toApiError(err));
          })
          .finally(() => {
            if (!done && !ctrl.signal.aborted) poll();
          });
      }, DEPLOY_POLL_MS);
    };
    const openStream = () => {
      es = new EventSource(deploymentStreamUrl(name, id));
      es.addEventListener("deployment", (event: Event) => {
        const data: unknown = Reflect.get(event, "data");
        if (typeof data !== "string") return;
        try {
          apply(parseDeployDetail(JSON.parse(data)));
        } catch {
          // A malformed frame is skipped; the next frame (or the poll fallback) catches up.
        }
      });
      es.addEventListener("end", () => {
        done = true;
        closeStream();
      });
      es.addEventListener("error", () => {
        closeStream();
        if (!done && !ctrl.signal.aborted) poll();
      });
    };

    getDeployment(name, id, { signal: ctrl.signal })
      .then((first) => {
        if (ctrl.signal.aborted) return;
        apply(first);
        setLoading(false);
        if (first.status === "running") openStream();
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(toApiError(err));
        setLoading(false);
      });

    return () => {
      done = true;
      ctrl.abort();
      closeStream();
      if (pollTimer !== null) clearTimeout(pollTimer);
    };
  }, [name, id, tick]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);
  return { deployment, error, loading, refetch };
}
