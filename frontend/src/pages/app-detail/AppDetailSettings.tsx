import { useCallback, useState } from "react";
import { deleteVolumesWarning } from "../../lib/deleteResult";
import { deleteApp, restartApp } from "../../api/client";
import { ApiError } from "../../api/errors";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { useToast } from "../../components/ui/Toast";
import { formatAbsoluteDate } from "../../lib/time";
import { useAppDetail } from "./useAppDetail";
import { useNavigate } from "react-router-dom";
import { PierIcon } from "../../components/icons/PierIcon";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { AppConfigCard } from "./AppConfigCard";
import { AppVolumesCard } from "./AppVolumesCard";
import { AppScaleCard } from "./AppScaleCard";

/**
 * Settings tab: configuration (AppConfigCard), scale, restart, and delete actions.
 * Scale: number input 0-10 with Apply button (disabled while pending/unchanged/invalid).
 * Restart: button opens confirm, success toast with timestamp, refetches app.
 * Delete: danger zone, type app name to enable, success navigates to /apps.
 */
export function AppDetailSettings() {
  const { app, refetch } = useAppDetail();
  const { push: showToast } = useToast();
  const navigate = useNavigate();

  // Restart
  const [restartConfirm, setRestartConfirm] = useState(false);
  const [restartPending, setRestartPending] = useState(false);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteNameInput, setDeleteNameInput] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteVolumes, setDeleteVolumes] = useState(false);

  const handleRestart = useCallback(async () => {
    setRestartPending(true);
    try {
      const result = await restartApp(app.name);
      showToast({
        variant: "success",
        title: `Restarted ${app.name}`,
        description: `at ${formatAbsoluteDate(result.restartedAt)}`,
      });
      setRestartConfirm(false);
      refetch();
    } catch (err) {
      const error = err instanceof ApiError ? err : ApiError.network(err);
      showToast({
        variant: "error",
        title: "Restart failed",
        description: error.message,
      });
    } finally {
      setRestartPending(false);
    }
  }, [app.name, showToast, refetch]);

  const handleDelete = useCallback(async () => {
    setDeletePending(true);
    try {
      const result = await deleteApp(app.name, { deleteVolumes });
      showToast({
        variant: "success",
        title: `Deleted ${app.name}`,
      });
      const warning = deleteVolumesWarning(result);
      if (warning) showToast({ variant: "warning", title: "Some volume data was retained", description: warning });
      setDeleteConfirm(false);
      navigate("/apps", { replace: true });
    } catch (err) {
      const error = err instanceof ApiError ? err : ApiError.network(err);
      // Treat 404 as success (app already gone)
      if (error.kind === "not_found") {
        showToast({
          variant: "success",
          title: `${app.name} was already deleted`,
        });
        navigate("/apps", { replace: true });
      } else {
        showToast({
          variant: "error",
          title: "Delete failed",
          description: error.message,
        });
      }
    } finally {
      setDeletePending(false);
    }
  }, [app.name, deleteVolumes, showToast, navigate]);

  return (
    <div className="space-y-6">
      <AppConfigCard />
      <AppVolumesCard />

      <AppScaleCard />

      {/* Restart section */}
      <div className="border border-pier-border rounded-pier-lg p-5 bg-pier-surface">
        <h3 className="m-0 text-[14px] font-semibold text-pier-fg mb-4">Restart</h3>
        <p className="m-0 text-sm text-pier-muted mb-4">
          Pods are replaced one by one with no downtime.
        </p>
        <Button
          onClick={() => setRestartConfirm(true)}
          variant="secondary"
          disabled={restartPending}
        >
          {restartPending ? "Restarting…" : "Restart"}
        </Button>
      </div>

      {/* Delete section (danger zone) */}
      <div className="border-2 border-pier-status-failed rounded-pier-lg p-5 bg-pier-status-failed/5">
        <h3 className="m-0 text-[14px] font-semibold text-pier-status-failed mb-4">
          Delete
        </h3>
        <p className="m-0 text-sm text-pier-muted mb-4">
          This action cannot be undone. The app and all its data will be permanently removed.
        </p>
        <Button
          onClick={() => setDeleteConfirm(true)}
          variant="danger"
          disabled={deletePending}
        >
          <PierIcon name="delete" size={14} />
          {deletePending ? "Deleting…" : `Delete ${app.name}`}
        </Button>
      </div>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={restartConfirm}
        onClose={() => setRestartConfirm(false)}
        onConfirm={handleRestart}
        title="Restart app?"
        description={`Restart ${app.name}? Pods are replaced one by one.`}
        confirmLabel="Restart"
      />

      <DeleteConfirmDialog
        open={deleteConfirm}
        appName={app.name}
        nameInput={deleteNameInput}
        onNameInputChange={setDeleteNameInput}
        onClose={() => {
          setDeleteConfirm(false);
          setDeleteNameInput("");
        }}
        onConfirm={handleDelete}
        pending={deletePending}
        volumeCount={app.volumes?.length}
        deleteVolumes={deleteVolumes}
        onDeleteVolumesChange={setDeleteVolumes}
      />
    </div>
  );
}
