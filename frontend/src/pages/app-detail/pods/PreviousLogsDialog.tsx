import { useCallback } from "react";
import { getAppLogsText } from "../../../api/client";
import type { AppPod } from "../../../api/types";
import { ApiError } from "../../../api/errors";
import { Dialog } from "../../../components/ui/Dialog";
import { useApi } from "../../../hooks/useApi";

export function PreviousLogsDialog({ appName, pod, onClose }: { appName: string; pod?: AppPod; onClose: () => void }) {
  const fetcher = useCallback((signal: AbortSignal) => pod
    ? getAppLogsText(appName, { pod: pod.name, tail: 500, previous: true }, { signal })
    : Promise.resolve(""), [appName, pod]);
  const { data, error, loading } = useApi(fetcher, [appName, pod?.name]);
  const message = error instanceof ApiError && error.status === 404 && error.error === "no previous logs"
    ? "No previous logs for this pod." : error?.details ?? error?.message;
  return <Dialog open={Boolean(pod)} onClose={onClose} title={`Previous logs: ${pod?.name ?? ""}`} className="max-w-3xl">
    {loading && <p className="text-sm text-pier-muted">Loading previous logs…</p>}
    {!loading && message && <p className="text-sm text-pier-muted">{message}</p>}
    {!loading && !error && <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{data}</pre>}
  </Dialog>;
}
