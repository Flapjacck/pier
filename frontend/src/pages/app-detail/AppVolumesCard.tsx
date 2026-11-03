import { useEffect, useMemo, useState } from "react";
import { listVolumes, updateApp } from "../../api/client";
import type { Volume, VolumeMount } from "../../api/types";
import { ApiError } from "../../api/errors";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { useToast } from "../../components/ui/Toast";
import { mountPathError, volumeNameError } from "../../lib/volumeValidation";
import { useAppDetail } from "./useAppDetail";

const sizes = ["512Mi", "1Gi", "5Gi", "10Gi"];

export function AppVolumesCard() {
  const { app, setApp } = useAppDetail();
  const { push: toast } = useToast();
  const [allVolumes, setAllVolumes] = useState<Volume[]>([]);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [draft, setDraft] = useState<VolumeMount>({ name: `${app.name}-data`, mountPath: "/data", size: "1Gi" });
  const [confirm, setConfirm] = useState<"attach" | string>();
  const [pending, setPending] = useState(false);

  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    void listVolumes().then(setAllVolumes).catch((err: unknown) => {
      const error = err instanceof ApiError ? err : ApiError.network(err);
      toast({ variant: "error", title: "Unable to list volumes", description: error.details ?? error.message });
    });
  }, [toast, refresh]);

  const attached = app.volumes ?? [];
  const available = useMemo(() => {
    const attachedNames = new Set((app.volumes ?? []).map((volume) => volume.name));
    return allVolumes.filter((volume) => !volume.app && !attachedNames.has(volume.name));
  }, [allVolumes, app.volumes]);
  const details = attached.map((mount) => ({ mount, volume: allVolumes.find((volume) => volume.name === mount.name) }));

  const save = async (mounts: VolumeMount[]) => {
    setPending(true);
    try {
      const next = await updateApp(app.name, { volumes: mounts });
      setApp(next);
      setConfirm(undefined);
      setRefresh((n) => n + 1);
      toast({ variant: "success", title: "Volumes updated" });
    } catch (err) {
      const error = err instanceof ApiError ? err : ApiError.network(err);
      toast({ variant: "error", title: "Volume update failed", description: error.details ?? error.message });
    } finally {
      setPending(false);
    }
  };

  // In existing mode the select shows the first free volume until the user picks one.
  const target: VolumeMount = mode === "existing"
    ? { name: available.some((v) => v.name === draft.name) ? draft.name : (available[0]?.name ?? ""), mountPath: draft.mountPath }
    : draft;
  const draftError = (mode === "new" ? volumeNameError(target.name) : undefined)
    ?? mountPathError(target.mountPath)
    ?? (attached.some((m) => m.name === target.name) ? "That volume is already attached" : undefined);

  // New volumes are created by the PATCH itself (size set), so a failed update leaves nothing behind.
  const attach = () => save([...attached, target]);

  return (
    <div className="border border-pier-border rounded-pier-lg p-5 bg-pier-surface">
      <h3 className="m-0 text-[14px] font-semibold text-pier-fg mb-2">Persistent volumes</h3>
      <p className="m-0 mb-4 text-sm text-pier-muted">Size reserves quota; local-path doesn't hard-limit disk use. Volumes can't be resized.</p>
      {details.length ? <ul className="m-0 p-0 list-none space-y-2">{details.map(({ mount, volume }) => (
        <li key={mount.name} className="flex items-center justify-between text-sm">
          <span><strong>{mount.name}</strong> at <code>{mount.mountPath}</code> ({volume?.size ?? "unknown"}, {volume?.status ?? "unknown"})</span>
          <Button variant="secondary" disabled={pending} onClick={() => setConfirm(mount.name)}>Detach</Button>
        </li>
      ))}</ul> : <p className="m-0 text-sm text-pier-muted">No volumes attached.</p>}
      <div className="mt-5 space-y-3">
        <h4 className="m-0 text-sm font-semibold">Attach volume</h4>
        <Field id="app-volume-mode" label="Volume">
          <Select id="app-volume-mode" value={mode} disabled={pending} onChange={(event) => {
            const next = event.target.value === "existing" ? "existing" : "new";
            setMode(next);
            if (next === "existing") setDraft({ name: available[0]?.name ?? "", mountPath: "/data" });
            if (next === "new") setDraft({ name: `${app.name}-data`, mountPath: "/data", size: "1Gi" });
          }}>
            <option value="new">New volume</option><option value="existing">Existing volume</option>
          </Select>
        </Field>
        {mode === "existing" ? <Field id="app-volume-existing" label="Existing volume">
          <Select id="app-volume-existing" disabled={pending || !available.length} value={target.name} onChange={(event) => setDraft({ ...draft, name: event.target.value, size: undefined })}>
            {available.map((volume) => <option key={volume.name}>{volume.name}</option>)}
          </Select>
        </Field> : <>
          <Field id="app-volume-name" label="Volume name"><Input id="app-volume-name" disabled={pending} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
          <Field id="app-volume-size" label="Size"><Select id="app-volume-size" disabled={pending} value={draft.size} onChange={(event) => setDraft({ ...draft, size: event.target.value })}>{sizes.map((size) => <option key={size}>{size}</option>)}</Select></Field>
        </>}
        <Field id="app-volume-path" label="Mount path" error={draftError}><Input id="app-volume-path" disabled={pending} value={draft.mountPath} onChange={(event) => setDraft({ ...draft, mountPath: event.target.value })} /></Field>
        <Button disabled={pending || Boolean(draftError) || (mode === "existing" && !available.length)} onClick={() => setConfirm("attach")}>Attach volume</Button>
      </div>
      <ConfirmDialog
        open={confirm !== undefined}
        onClose={() => setConfirm(undefined)}
        onConfirm={() => {
          if (confirm === "attach") void attach();
          else if (confirm) void save(attached.filter((volume) => volume.name !== confirm));
        }}
        title={confirm === "attach" ? "Attach volume?" : "Detach volume?"}
        description="The app restarts with brief downtime (volume apps stop the old pod before starting the new one)."
        confirmLabel={pending ? "Saving…" : confirm === "attach" ? "Attach" : "Detach"}
      />
    </div>
  );
}
