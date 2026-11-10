import type { ReactNode } from "react";
import type { DeployFormState } from "../useDeployForm";

interface Props {
  form: DeployFormState;
  ingressDomain: string | null;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 py-2 border-b border-pier-border last:border-b-0">
      <dt className="w-32 shrink-0 text-xs text-pier-muted">{label}</dt>
      <dd className="m-0 text-[13px] text-pier-fg min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Everything Deploy will send. Env values are not echoed back, only their names. */
export function ReviewStep({ form, ingressDomain }: Props) {
  const { source } = form;
  const envKeys = form.env.rows.map((r) => r.key.trim()).filter(Boolean);
  const railpack = form.kind === "repo" && source.method === "railpack";
  return (
    <dl className="m-0">
      <Row label="App">{form.name}</Row>
      {form.kind === "image" ? (
        <Row label="Image"><code className="font-mono">{form.image}</code>{form.registry ? ` via ${form.registry}` : ""}</Row>
      ) : (
        <>
          <Row label="Repository"><code className="font-mono">{source.repo}</code></Row>
          <Row label="Branch">{source.branch}</Row>
          <Row label="Build">
            {source.method === "railpack" ? "Railpack" : `Dockerfile ${source.dockerfile}`} in <code className="font-mono">{source.folder}</code>
          </Row>
          {source.gitCredential && <Row label="Git credential">{source.gitCredential}</Row>}
        </>
      )}
      <Row label="Port">{form.port}</Row>
      <Row label="Replicas">{form.replicas}</Row>
      <Row label="Volume">
        {form.volumes.volume ? <><code className="font-mono">{form.volumes.volume.mountPath}</code> on {form.volumes.volume.name}{form.volumes.mode === "new" ? ` (new, ${form.volumes.volume.size ?? "1Gi"})` : ""}</> : "None"}
      </Row>
      <Row label="Public URL">{form.publicUrl && ingressDomain && form.subdomain ? `${form.subdomain}.${ingressDomain}` : "Off"}</Row>
      <Row label="Env">
        {envKeys.length || railpack ? [...envKeys, ...(railpack && !envKeys.includes("PORT") ? ["PORT (set by Pier)"] : [])].join(", ") : "None"}
      </Row>
    </dl>
  );
}
