import { useCallback, useState } from "react";
import { deleteApp, restartApp, scaleApp } from "../../api/client";
import { ApiError } from "../../api/errors";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog, Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { useToast } from "../../components/ui/Toast";
import { formatAbsoluteDate } from "../../lib/time";
import { useAppDetail } from "./useAppDetail";
import { useNavigate } from "react-router-dom";
import { PierIcon } from "../../components/icons/PierIcon";

/**
 * Settings tab: scale, restart, and delete actions.
 * Scale: number input 0-10 with Apply button (disabled while pending/unchanged/invalid).
 * Restart: button opens confirm, success toast with timestamp, refetches app.
 * Delete: danger zone, type app name to enable, success navigates to /apps.
 */
export function AppDetailSettings() {
  const { app, refetch, setApp } = useAppDetail();
  const { push: showToast } = useToast();
  const navigate = useNavigate();

  // Scale
  const [scaleValue, setScaleValue] = useState(String(app.replicas));
  const [scaleError, setScaleError] = useState("");
  const [scalePending, setScalePending] = useState(false);
  const [scaleConfirm, setScaleConfirm] = useState(false);

  // Restart
  const [restartConfirm, setRestartConfirm] = useState(false);
  const [restartPending, setRestartPending] = useState(false);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteNameInput, setDeleteNameInput] = useState("");
  const [deletePending, setDeletePending] = useState(false);

  // Validate scale input
  const validateScale = (val: string): string => {
    if (!val) return "Required";
    const num = parseInt(val, 10);
    if (Number.isNaN(num)) return "Must be a number";
    if (num < 0 || num > 10) return "Must be 0–10";
    return "";
  };

  const scaleInt = parseInt(scaleValue, 10);
  const isScaleValid = !validateScale(scaleValue);
  const isScaleUnchanged = scaleInt === app.replicas;
  const isScaleDisabled = !isScaleValid || isScaleUnchanged || scalePending;

  const handleScale = useCallback(async () => {
    if (!isScaleValid) return;
    setScalePending(true);
    try {
      const result = await scaleApp(app.name, scaleInt);
      setApp(result);
      showToast({
        variant: "success",
        title: `Scaled ${app.name} to ${scaleInt} replicas`,
      });
      setScaleConfirm(false);
    } catch (err) {
      const error = err instanceof ApiError ? err : ApiError.network(err);
      showToast({
        variant: "error",
        title: "Scale failed",
        description: error.message,
      });
    } finally {
      setScalePending(false);
    }
  }, [app.name, scaleInt, isScaleValid, setApp, showToast]);

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
      await deleteApp(app.name);
      showToast({
        variant: "success",
        title: `Deleted ${app.name}`,
      });
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
  }, [app.name, showToast, navigate]);

  return (
    <div className="space-y-6">
      {/* Scale section */}
      <div className="border border-pier-border rounded-pier-lg p-5 bg-pier-surface">
        <h3 className="m-0 text-[14px] font-semibold text-pier-fg mb-4">Scale</h3>
        <div className="flex items-end gap-3">
          <Field
            id="scale-replicas"
            label="Replicas"
            hint="0–10 pods"
            error={scaleError || validateScale(scaleValue)}
            className="flex-1 max-w-xs"
          >
            <Input
              type="number"
              min="0"
              max="10"
              value={scaleValue}
              onChange={(e) => {
                setScaleValue(e.currentTarget.value);
                setScaleError("");
              }}
              disabled={scalePending}
            />
          </Field>
          <Button
            onClick={handleScale}
            disabled={isScaleDisabled}
            title={
              isScaleUnchanged
                ? "No change"
                : !isScaleValid
                  ? "Invalid value"
                  : undefined
            }
          >
            {scalePending ? "Applying…" : "Apply"}
          </Button>
        </div>
      </div>

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
        open={scaleConfirm}
        onClose={() => setScaleConfirm(false)}
        onConfirm={handleScale}
        title="Confirm scaling"
        description={`Scale ${app.name} to ${scaleInt} replica${scaleInt === 1 ? "" : "s"}?`}
        confirmLabel="Scale"
      />

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
      />
    </div>
  );
}

interface DeleteConfirmDialogProps {
  open: boolean;
  appName: string;
  nameInput: string;
  onNameInputChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
}

function DeleteConfirmDialog({
  open,
  appName,
  nameInput,
  onNameInputChange,
  onClose,
  onConfirm,
  pending,
}: DeleteConfirmDialogProps) {
  const nameMatches = nameInput === appName;

  return (
    <Dialog open={open} onClose={onClose} title="Delete app?">
      <p className="m-0 mb-4 text-sm text-pier-muted">
        This will permanently delete <strong>{appName}</strong> and cannot be undone.
      </p>
      <p className="m-0 mb-4 text-sm text-pier-muted">
        To confirm, type the app name:
      </p>
      <Field
        id="delete-confirm-name"
        label="App name"
        className="mb-4"
      >
        <Input
          type="text"
          placeholder={appName}
          value={nameInput}
          onChange={(e) => onNameInputChange(e.currentTarget.value)}
          disabled={pending}
          autoFocus
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant="danger"
          type="button"
          onClick={onConfirm}
          disabled={!nameMatches || pending}
        >
          {pending ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </Dialog>
  );
}
