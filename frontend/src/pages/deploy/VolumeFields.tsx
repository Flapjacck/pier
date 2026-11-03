import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import type { Volume, VolumeMount } from "../../api/types";
import type { FieldErrors } from "../../lib/deployValidation";

type Props = {
  appName: string;
  volume?: VolumeMount;
  mode: "new" | "existing";
  available: Volume[];
  loading: boolean;
  errors?: FieldErrors["volume"];
  onModeChange: (mode: "new" | "existing") => void;
  onChange: (value: VolumeMount | undefined) => void;
  onNameChange: (name: string) => void;
};

export function VolumeFields({
  appName,
  volume,
  mode,
  available,
  loading,
  errors,
  onModeChange,
  onChange,
  onNameChange,
}: Props) {
  const addNew = () => onChange({ name: `${appName || "app"}-data`, mountPath: "/data", size: "1Gi" });
  const selectExisting = (name: string) => {
    const selected = available.find((item) => item.name === name);
    onChange(selected ? { name: selected.name, mountPath: "/data" } : undefined);
  };

  return (
    <details className="border border-pier-border rounded-pier-lg p-4">
      <summary className="cursor-pointer text-sm font-semibold">Persistent volume</summary>
      {!volume ? (
        <div className="mt-4">
          <button type="button" className="text-sm text-pier-accent" onClick={addNew}>Add a volume</button>
        </div>
      ) : (
        <div className="space-y-3 mt-4">
          <Field id="deploy-volume-mode" label="Volume">
            <Select id="deploy-volume-mode" value={mode} onChange={(event) => {
              const next = event.target.value === "existing" ? "existing" : "new";
              onModeChange(next);
              if (next === "new") addNew();
              else selectExisting(available[0]?.name ?? "");
            }}>
              <option value="new">New volume</option>
              <option value="existing">Existing volume</option>
            </Select>
          </Field>
          {mode === "new" ? (
            <>
              <Field id="deploy-volume-name" label="Volume name" error={errors?.name}>
                <Input id="deploy-volume-name" value={volume.name} onChange={(event) => onNameChange(event.target.value)} />
              </Field>
              <Field id="deploy-volume-size" label="Size" error={errors?.size} hint="Size reserves quota; local-path doesn't hard-limit disk use. Volumes can't be resized.">
                <Select id="deploy-volume-size" value={volume.size ?? "1Gi"} onChange={(event) => onChange({ ...volume, size: event.target.value })}>
                  <option>512Mi</option><option>1Gi</option><option>5Gi</option><option>10Gi</option>
                </Select>
              </Field>
            </>
          ) : (
            <Field id="deploy-volume-existing" label="Existing volume" error={available.length ? undefined : "No unattached volumes available"}>
              <Select id="deploy-volume-existing" value={volume.name} disabled={loading} onChange={(event) => selectExisting(event.target.value)}>
                {available.map((item) => <option key={item.name} value={item.name}>{item.name} ({item.size})</option>)}
              </Select>
            </Field>
          )}
          <Field id="deploy-volume-path" label="Mount path" error={errors?.mountPath}>
            <Input id="deploy-volume-path" value={volume.mountPath} onChange={(event) => onChange({ ...volume, mountPath: event.target.value })} />
          </Field>
          <button type="button" className="text-sm text-pier-muted" onClick={() => onChange(undefined)}>Remove volume</button>
        </div>
      )}
    </details>
  );
}
