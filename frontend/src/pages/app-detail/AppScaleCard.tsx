import { useState } from "react";
import { scaleApp } from "../../api/client";
import { ApiError } from "../../api/errors";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { useToast } from "../../components/ui/Toast";
import { useAppDetail } from "./useAppDetail";

export function AppScaleCard() {
  const { app, setApp } = useAppDetail();
  const { push: toast } = useToast();
  const [value, setValue] = useState(String(app.replicas));
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const max = app.volumes?.length ? 1 : 10;
  const parsed = Number(value);
  const error = !value ? "Required" : !Number.isInteger(parsed) || parsed < 0 || parsed > max ? `Must be 0–${max}` : "";

  async function apply() {
    if (error) return;
    setPending(true);
    try {
      setApp(await scaleApp(app.name, parsed));
      setConfirm(false);
      toast({ variant: "success", title: `Scaled ${app.name} to ${parsed} replicas` });
    } catch (err) {
      const apiError = err instanceof ApiError ? err : ApiError.network(err);
      toast({ variant: "error", title: "Scale failed", description: apiError.details ?? apiError.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border border-pier-border rounded-pier-lg p-5 bg-pier-surface">
      <h3 className="m-0 text-[14px] font-semibold text-pier-fg mb-4">Scale</h3>
      <div className="flex items-end gap-3">
        <Field id="scale-replicas" label="Replicas" hint={app.volumes?.length ? "Volume apps run at most 1 replica" : "0–10 pods"} error={error} className="flex-1 max-w-xs">
          <Input id="scale-replicas" type="number" min="0" max={max} value={value} onChange={(event) => setValue(event.currentTarget.value)} disabled={pending} />
        </Field>
        <Button onClick={() => setConfirm(true)} disabled={Boolean(error) || parsed === app.replicas || pending}>Apply</Button>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void apply()} title="Confirm scaling" description={`Scale ${app.name} to ${parsed} replica${parsed === 1 ? "" : "s"}?`} confirmLabel={pending ? "Applying…" : "Scale"} />
    </div>
  );
}
