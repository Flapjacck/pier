import { useCallback, useMemo, useState } from "react";
import { listAppPods } from "../../api/client";
import { LogViewer } from "../../components/ui/LogViewer";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { useApi } from "../../hooks/useApi";
import { useLogStream } from "../../hooks/useLogStream";
import { useAppDetail } from "./useAppDetail";

const TAIL_OPTIONS = [100, 200, 1000];

/**
 * Logs tab: live log viewer with pod/tail picker, filter, copy, and download.
 * Uses EventSource for streaming or plain fetch for static mode.
 */
export function AppDetailLogs() {
  const { app } = useAppDetail();
  const [selectedPod, setSelectedPod] = useState<string | undefined>(undefined);
  const [selectedTail, setSelectedTail] = useState(200);
  const [follow, setFollow] = useState(true);

  // Fetch pods list
  const podFetcher = useCallback(
    (signal: AbortSignal) => listAppPods(app.name, { signal }),
    [app.name],
  );
  const { data: pods = [], loading: podsLoading } = useApi(podFetcher, [app.name]);

  // Default to newest pod
  const newestPod = useMemo(() => pods[0]?.name, [pods]);
  const activePod = selectedPod ?? newestPod;

  // Stream logs for selected pod
  const { lines, status, droppedCount, clear, reconnectNow } = useLogStream({
    name: app.name,
    pod: activePod,
    tail: selectedTail,
    follow,
  });

  if (podsLoading) {
    return <div className="p-6 text-center text-pier-muted">Loading pods…</div>;
  }

  if (!pods || pods.length === 0) {
    return (
      <div className="p-6 border border-pier-border rounded-pier-lg bg-pier-surface text-center">
        <p className="text-sm text-pier-muted m-0">
          No pods running. Scale up in Settings.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Toolbar */}
      <div className="flex gap-3 items-end flex-wrap">
        <div className="flex-1 min-w-max">
          <label htmlFor="pod-select" className="block text-[12px] font-medium text-pier-fg mb-1">
            Pod
          </label>
          <Select
            id="pod-select"
            value={activePod || ""}
            onChange={(e) => setSelectedPod(e.currentTarget.value || undefined)}
          >
            {pods.map((pod) => (
              <option key={pod.name} value={pod.name}>
                {pod.name} ({pod.phase})
              </option>
            ))}
          </Select>
        </div>

        <div className="flex-1 min-w-max">
          <label htmlFor="tail-select" className="block text-[12px] font-medium text-pier-fg mb-1">
            Tail
          </label>
          <Select
            id="tail-select"
            value={selectedTail}
            onChange={(e) => setSelectedTail(Number(e.currentTarget.value))}
          >
            {TAIL_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} lines
              </option>
            ))}
          </Select>
        </div>

        <Button
          variant={follow ? "primary" : "secondary"}
          size="sm"
          onClick={() => setFollow(!follow)}
        >
          Follow
        </Button>
      </div>

      {/* Log viewer */}
      <div className="flex-1 min-h-0 border border-pier-border rounded-pier-lg overflow-hidden">
        <LogViewer
          podName={activePod || ""}
          lines={lines}
          status={status}
          droppedCount={droppedCount}
          onClear={clear}
          onReconnectNow={reconnectNow}
        />
      </div>
    </div>
  );
}
