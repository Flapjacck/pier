import { useCallback } from "react";
import { Button } from "../../../components/ui/Button";
import { Field } from "../../../components/ui/Field";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { listRegistries } from "../../../api/registries";
import { useApi } from "../../../hooks/useApi";
import type { DeployFormState } from "../useDeployForm";

/** Pre-built image path: unchanged behaviour from before the wizard, minus auto-attached volumes. */
export function ImageConnect({ form }: { form: DeployFormState }) {
  const registryFetcher = useCallback((signal: AbortSignal) => listRegistries({ signal }), []);
  const { data: registries = [] } = useApi(registryFetcher, []);
  return (
    <div className="space-y-4">
      {/* Field puts its id on its direct child, so the Input must be that child. */}
      <div>
        <Field id="deploy-image" label="Image" hint="e.g. nginx:1.27" error={form.errors.image}>
          <Input value={form.image} onChange={(e) => form.setImage(e.target.value)} placeholder="nginx:1.27" className="font-mono text-[12.5px]" invalid={Boolean(form.errors.image)} />
        </Field>
        <div className="flex items-center gap-2 mt-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => void form.checkImage()} disabled={form.checkingImage || !form.image.trim()}>
              {form.checkingImage ? "Checking…" : "Check image"}
            </Button>
            {form.imageHint && <span className="text-xs text-pier-muted">{form.imageHint}</span>}
        </div>
      </div>
      {registries.length > 0 && (
        <Field id="deploy-registry" label="Registry" hint="Credentials are never shown again.">
          <Select id="deploy-registry" value={form.registry} onChange={(e) => form.setRegistry(e.target.value)}>
            <option value="">Public / anonymous</option>
            {registries.map((item) => <option key={item.name} value={item.name}>{item.name} ({item.server})</option>)}
          </Select>
        </Field>
      )}
    </div>
  );
}
