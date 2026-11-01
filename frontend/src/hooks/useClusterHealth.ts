import { useCallback, useEffect, useState } from "react";
import {
  clearClusterHealthDebug,
  getClusterHealth,
  type ClusterHealthState,
} from "../lib/clusterHealth";

const POLL_MS = 30_000;

/** Poll cluster health while the document tab is visible. */
export function useClusterHealth() {
  const [state, setState] = useState<ClusterHealthState>("checking");

  const refresh = useCallback(async () => {
    setState("checking");
    const next = await getClusterHealth();
    setState(next);
  }, []);

  useEffect(() => {
    void refresh();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(id);
    };
  }, [refresh]);

  const retry = useCallback(() => {
    clearClusterHealthDebug();
    void refresh();
  }, [refresh]);

  return { state, retry };
}
