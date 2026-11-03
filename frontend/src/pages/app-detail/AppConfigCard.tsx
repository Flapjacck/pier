import { ResourcesFields } from "../../components/apps/ResourcesFields";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { useToast } from "../../components/ui/Toast";
import { describeChanges } from "../../lib/appConfig";
import { EnvRows } from "../deploy/EnvRows";
import { useAppDetail } from "./useAppDetail";
import { useAppConfigForm } from "./useAppConfigForm";

/**
 * Settings tab: edit image, port, env and CPU/RAM. Saving PATCHes only the changed
 * fields (after a confirm, since pods are replaced) and updates the page with the result.
 */
export function AppConfigCard() {
  const { app, setApp } = useAppDetail();
  const { push: showToast } = useToast();
  const form = useAppConfigForm(app, setApp, showToast);
  const { values, errors } = form;

  return (
    <div className="border border-pier-border rounded-pier-lg p-5 bg-pier-surface">
      <h3 className="m-0 text-[14px] font-semibold text-pier-fg mb-1">Configuration</h3>
      <p className="m-0 text-sm text-pier-muted mb-4">
        Saving rolls out new pods one by one. Env replaces the whole set.
      </p>
      <form
        className="space-y-4 max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          form.requestSave();
        }}
      >
        <Field id="config-image" label="Image" hint="e.g. nginx:1.27" error={errors.image}>
          <Input
            id="config-image"
            value={values.image}
            onChange={(e) => form.setImage(e.target.value)}
            className="font-mono text-[12.5px]"
            invalid={Boolean(errors.image)}
            disabled={form.pending}
          />
        </Field>
        <Field id="config-port" label="Port" hint="Container port, 1–65535" error={errors.port}>
          <Input
            id="config-port"
            type="number"
            value={values.port}
            onChange={(e) => form.setPort(e.target.value)}
            invalid={Boolean(errors.port)}
            disabled={form.pending}
            className="max-w-xs"
          />
        </Field>
        <ResourcesFields
          idPrefix="config"
          value={values.resources}
          onChange={form.setResources}
          errors={errors.resources}
          disabled={form.pending}
        />
        <EnvRows
          rows={form.env.rows}
          errors={errors.env ?? {}}
          onRowChange={form.env.change}
          onRowRemove={form.env.remove}
          onRowAdd={form.env.add}
          onClearRowError={() => {}}
        />
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={!form.dirty || form.pending}>
            {form.pending ? "Saving…" : "Save changes"}
          </Button>
          <Button type="button" variant="secondary" onClick={form.discard} disabled={!form.dirty || form.pending}>
            Discard
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={form.confirmBody !== null}
        onClose={form.closeConfirm}
        onConfirm={() => void form.save()}
        title="Apply changes?"
        description={
          form.confirmBody
            ? `Update ${app.name} (${describeChanges(form.confirmBody)})? Pods are replaced one by one.`
            : undefined
        }
        confirmLabel="Apply"
      />
    </div>
  );
}
