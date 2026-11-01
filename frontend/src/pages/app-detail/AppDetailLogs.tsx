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
  const { data: pods = [] } = useApi(podFetcher, [app.name]);

  // Default to newest pod
  const newestPodName = pods[0]?.name;
  const activePod = selectedPod ?? newestPodName;

  // Stream logs
  const logStream = useLogStream({
    name: app.name,
    pod: activePod, // undefined until pods load, so stream waits
    tail: selectedTail,
    follow,
  });

  if (pods.length === 0) {
    return (
      <div className="p-6 border border-pier-border rounded-pier-lg bg-pier-surface text-center">
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
