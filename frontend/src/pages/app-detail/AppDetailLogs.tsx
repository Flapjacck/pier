import { useCallback, useState } from "react";
import { listAppPods } from "../../api/client";
import { LogsCard } from "../../components/ui/LogsCard";
import { useApi } from "../../hooks/useApi";
import { useLogStream } from "../../hooks/useLogStream";
import { useAppDetail } from "./useAppDetail";

/**
 * Logs tab: live log streaming with pod selection and follow toggle.
 * All UI logic is in LogsCard for reusability.
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
  const { data: pods = [], loading: podsLoading, error: podsError } = useApi(podFetcher, [app.name]);

  // Default to newest pod, or fall back if selected pod was removed
  const newestPodName = pods[0]?.name;
  const activePod = selectedPod && pods.some((p) => p.name === selectedPod)
    ? selectedPod
    : newestPodName;

  // Stream logs
  const logStream = useLogStream({
    name: app.name,
    pod: activePod, // undefined until pods load, so stream waits
    tail: selectedTail,
    follow,
  });

  // Show skeleton while loading pods
  if (podsLoading && pods.length === 0) {
    return (
      <div className="border border-pier-border rounded-pier-lg bg-pier-surface p-6">
        <div className="space-y-3">
          <div className="h-8 bg-pier-surface-2 rounded animate-pulse" />
          <div className="h-32 bg-pier-surface-2 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  // Show error if pods failed to load
  if (podsError) {
    return (
      <div className="border border-pier-border rounded-pier-lg bg-pier-surface text-center p-6">
        <p className="text-sm text-pier-muted m-0 mb-3">
          Failed to load pods: {podsError.message}
        </p>
        {/* Retry is implicit via the useApi hook's refetch */}
      </div>
    );
  }

  // Show message if no pods are running
  if (pods.length === 0) {
    return (
      <div className="border border-pier-border rounded-pier-lg bg-pier-surface text-center p-6">
        <p className="text-sm text-pier-muted m-0">
          No pods running. Scale up in Settings.
        </p>
      </div>
    );
  }

  return (
    <LogsCard
      appName={app.name}
      pods={pods}
      selectedPod={activePod || ""}
      onSelectPod={setSelectedPod}
      selectedTail={selectedTail}
      onSelectTail={setSelectedTail}
      follow={follow}
      onToggleFollow={setFollow}
      {...logStream}
    />
  );
}
