import { Field } from "../../../components/ui/Field";
import { Input } from "../../../components/ui/Input";
import type { DeployFormState } from "../useDeployForm";

export function AppStep({ form }: { form: DeployFormState }) {
  return (
    <Field
      id="deploy-name"
      label="App name"
      hint="Start with a lowercase letter, use lowercase letters, numbers, and hyphens only (≤63 chars)"
      error={form.errors.name}
    >
      <Input id="deploy-name" value={form.name} onChange={(e) => form.setName(e.target.value)} placeholder="demo" invalid={Boolean(form.errors.name)} />
    </Field>
  );
}
