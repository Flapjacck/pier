import { Field } from "../../../components/ui/Field";
import { Input } from "../../../components/ui/Input";
import { ResourcesFields } from "../../../components/apps/ResourcesFields";
import type { VolumeHint } from "../../../api/types";
import { EnvRows } from "../EnvRows";
import { HostField } from "../HostField";
import { SuggestedVolumes } from "../SuggestedVolumes";
import { VolumeFields } from "../VolumeFields";
import type { DeployFormState } from "../useDeployForm";

interface Props {
  form: DeployFormState;
  ingressDomain: string | null;
  tls: boolean;
}

/** Port, scale, resources, storage, URL and env: everything about how the app runs. */
export function RuntimeStep({ form, ingressDomain, tls }: Props) {
  const { volumes, errors } = form;
  const railpack = form.kind === "repo" && form.source.method === "railpack";
  const addHint = (hint: VolumeHint) => {
    form.addHint(hint);
    // Show the pre-filled row so it's obvious what Deploy will create.
    const section = document.getElementById("deploy-volume-section");
    if (section instanceof HTMLDetailsElement) section.open = true;
  };
  return (
    <div className="space-y-4">
      <Field id="deploy-port" label="Port" hint={railpack ? "Pier sets PORT to this for Railpack builds unless you add your own PORT below." : "1–65535"} error={errors.port}>
        <Input id="deploy-port" type="number" value={form.port} onChange={(e) => form.setPort(e.target.value)} placeholder="80" invalid={Boolean(errors.port)} />
      </Field>
      <Field id="deploy-replicas" label="Replicas" hint={volumes.volume ? "Volume apps run at most 1 replica" : "0–10"} error={errors.replicas}>
        <Input id="deploy-replicas" type="number" value={form.replicas} onChange={(e) => form.setReplicas(e.target.value)} disabled={Boolean(volumes.volume)} placeholder="1" invalid={Boolean(errors.replicas)} />
      </Field>
      <ResourcesFields idPrefix="deploy" value={form.resources} onChange={form.setResources} errors={errors.resources} />
      <SuggestedVolumes hints={form.hints} loading={form.hintsLoading} onAdd={addHint} onDismiss={form.dismissHint} />
      <VolumeFields appName={form.name} volume={volumes.volume} mode={volumes.mode} available={volumes.available} loading={volumes.loading} errors={errors.volume} onModeChange={volumes.setMode} onNameChange={volumes.setVolumeName} onChange={(next) => {
        volumes.setVolume(next);
        if (next) form.setReplicas("1");
      }} />
      {ingressDomain ? (
        <>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="deploy-public-url" checked={form.publicUrl} onChange={(e) => form.setPublicUrl(e.target.checked)} className="w-4 h-4 cursor-pointer" />
            <label htmlFor="deploy-public-url" className="text-[13px] font-medium text-pier-fg cursor-pointer">Public URL</label>
          </div>
          {form.publicUrl && (
            <HostField id="deploy-host" subdomain={form.subdomain} ingressDomain={ingressDomain} tls={tls} onSubdomainChange={form.setSubdomain} onClearError={() => form.clearError("host")} error={errors.host} />
          )}
        </>
      ) : (
        <div className="p-3 rounded-pier bg-pier-surface border border-pier-border">
          <p className="text-[12px] text-pier-muted m-0">Public URLs are off: <code className="font-mono">PIER_INGRESS_DOMAIN</code> isn't set on the backend.</p>
        </div>
      )}
      <EnvRows rows={form.env.rows} errors={errors.env ?? {}} onRowChange={form.env.change} onRowRemove={form.env.remove} onRowAdd={form.env.add} onClearRowError={form.clearEnvRowError} />
    </div>
  );
}
