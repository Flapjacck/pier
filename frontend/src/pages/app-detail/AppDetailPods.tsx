import { useState } from "react";
import { deleteAppPod } from "../../api/client";
import type { AppPod } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { Table, TableBody, TableEmpty, TableHead, TableHeaderCell, TableRow } from "../../components/ui/Table";
import { useToast } from "../../components/ui/Toast";
import { EventsList } from "./pods/EventsList";
import { PodsTable } from "./pods/PodsTable";
import { PreviousLogsDialog } from "./pods/PreviousLogsDialog";
import { useAppDetail } from "./useAppDetail";
import { useAppEvents } from "./useAppEvents";
import { usePodsPolling } from "./usePodsPolling";

export function AppDetailPods() {
  const { app } = useAppDetail();
  const { push } = useToast();
  const podsState = usePodsPolling(app.name);
  const eventsState = useAppEvents(app.name);
  const [confirmPod, setConfirmPod] = useState<AppPod>();
  const [logsPod, setLogsPod] = useState<AppPod>();
  const [pendingPod, setPendingPod] = useState<string>();
  const pods = podsState.data ?? [];
  const refresh = () => { podsState.refetch(); eventsState.refetch(); };
  const restart = async () => {
    if (!confirmPod) return;
    setPendingPod(confirmPod.name);
    try {
      await deleteAppPod(app.name, confirmPod.name);
      push({ variant: "success", title: "Pod restarted", description: `${confirmPod.name} is being replaced.` });
      setConfirmPod(undefined);
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      push({ variant: "error", title: "Couldn't restart pod", description: message });
    } finally {
      setPendingPod(undefined);
    }
  };
  const error = podsState.error ?? eventsState.error;
  return <div>
    <div className="mb-4"><Button onClick={refresh} variant="secondary" size="sm">Refresh</Button></div>
    {error && <p className="mb-4 text-sm text-pier-status-failed-text">{error.details ?? error.message}</p>}
    {podsState.loading && !podsState.data ? <p className="text-sm text-pier-muted">Loading pods…</p> : pods.length === 0
      ? <Table><TableHead><TableRow><TableHeaderCell>Pods</TableHeaderCell></TableRow></TableHead><TableBody><TableEmpty colSpan={1}>No pods (scaled to 0?)</TableEmpty></TableBody></Table>
      : <PodsTable pods={pods} pendingPod={pendingPod} onRestart={setConfirmPod} onPreviousLogs={setLogsPod} />}
    <section className="mt-8"><h2 className="mb-3 text-sm font-semibold">Events</h2>{eventsState.loading && !eventsState.data ? <p className="text-sm text-pier-muted">Loading events…</p> : <EventsList events={eventsState.data?.events ?? []} />}</section>
    <ConfirmDialog
      open={Boolean(confirmPod)}
      onClose={() => setConfirmPod(undefined)}
      onConfirm={() => void restart()}
      title={`Restart pod ${confirmPod?.name ?? ""}?`}
      description={`Kubernetes deletes it and the Deployment starts a replacement.${app.replicas === 1 ? " The app is briefly down while the new pod starts." : ""}`}
      confirmLabel="Restart"
      variant="danger"
    />
    <PreviousLogsDialog appName={app.name} pod={logsPod} onClose={() => setLogsPod(undefined)} />
  </div>;
}
