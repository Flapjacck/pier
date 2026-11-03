import { useState } from "react";
import type { AppResources } from "../../api/types";
import {
  getResourceField,
  presetIdFor,
  RESOURCE_PRESETS,
  setResourceField,
  type PresetId,
  type ResourceErrors,
  type ResourceField,
} from "../../lib/resources";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";

interface Props {
  /** Prefix for element ids, e.g. "deploy" → "deploy-resources-preset". */
  idPrefix: string;
  value: AppResources;
  onChange: (value: AppResources) => void;
  errors?: ResourceErrors;
  disabled?: boolean;
}

const CUSTOM_FIELDS: ReadonlyArray<{ field: ResourceField; label: string; placeholder: string }> = [
  { field: "requests.cpu", label: "CPU request", placeholder: "50m" },
  { field: "limits.cpu", label: "CPU limit", placeholder: "500m" },
  { field: "requests.memory", label: "Memory request", placeholder: "64Mi" },
  { field: "limits.memory", label: "Memory limit", placeholder: "256Mi" },
];

function describe(res: AppResources): string {
  return `Reserves ${res.requests.cpu} CPU / ${res.requests.memory} RAM, capped at ${res.limits.cpu} CPU / ${res.limits.memory} RAM`;
}

/**
 * CPU/RAM picker: Small/Default/Medium/Large presets, or Custom with four quantity inputs.
 * Requests are what the pod reserves; limits are the hard cap (memory over the cap is OOM-killed).
 */
export function ResourcesFields({ idPrefix, value, onChange, errors = {}, disabled }: Props) {
  const [custom, setCustom] = useState(() => presetIdFor(value) === "custom");
  const selected: PresetId = custom ? "custom" : presetIdFor(value);
  const presetId = `${idPrefix}-resources-preset`;

  const choose = (id: string) => {
    const preset = RESOURCE_PRESETS.find((p) => p.id === id);
    if (preset) {
      setCustom(false);
      onChange(preset.values);
    } else {
      setCustom(true);
    }
  };

  return (
    <div className="space-y-3">
      <Field
        id={presetId}
        label="CPU & memory"
        hint={selected === "custom" ? "Requests are reserved; limits are the hard cap" : describe(value)}
      >
        <Select id={presetId} value={selected} onChange={(e) => choose(e.target.value)} disabled={disabled}>
          {RESOURCE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </Select>
      </Field>
      {selected === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          {CUSTOM_FIELDS.map(({ field, label, placeholder }) => {
            const id = `${idPrefix}-resources-${field.replace(".", "-")}`;
            return (
              <Field key={field} id={id} label={label} error={errors[field]}>
                <Input
                  id={id}
                  value={getResourceField(value, field)}
                  onChange={(e) => onChange(setResourceField(value, field, e.target.value))}
                  placeholder={placeholder}
                  className="font-mono text-[12.5px]"
                  invalid={Boolean(errors[field])}
                  disabled={disabled}
                />
              </Field>
            );
          })}
        </div>
      )}
    </div>
  );
}
