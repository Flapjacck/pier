import { Field } from "../../../components/ui/Field";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { cn } from "../../../lib/cn";
import type { BuildMethod } from "../../../api/types";
import { dockerfilesIn } from "../useSourceFields";
import type { DeployFormState } from "../useDeployForm";

const METHODS: { method: BuildMethod; title: string; body: string }[] = [
  { method: "railpack", title: "Railpack (recommended)", body: "Detects the language and builds an image, no Dockerfile needed." },
  { method: "dockerfile", title: "Dockerfile", body: "Build with BuildKit from a Dockerfile in the repo." },
];

/** Build method and folder (#83). Dockerfile paths are relative to the chosen folder. */
export function BuildStep({ form }: { form: DeployFormState }) {
  const { source } = form;
  const folders = source.probe.result?.folders ?? ["."];
  const dockerfiles = dockerfilesIn(source.probe.result?.dockerfiles ?? [], source.folder);
  return (
    <div className="space-y-4">
      <fieldset className="m-0 p-0 border-0 space-y-2">
        <legend className="text-[13px] font-medium text-pier-fg mb-2">Build method</legend>
        {METHODS.map((option) => (
          <label key={option.method} className={cn("flex gap-3 items-start p-3 rounded-pier border cursor-pointer", source.method === option.method ? "border-pier-accent bg-pier-surface" : "border-pier-border")}>
            <input type="radio" name="deploy-method" value={option.method} checked={source.method === option.method} onChange={() => source.setMethod(option.method)} className="mt-1" />
            <span>
              <span className="block text-sm font-medium text-pier-fg">{option.title}</span>
              <span className="block text-xs text-pier-muted">{option.body}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {source.method === "railpack" && dockerfiles.length > 0 && (
        <p className="m-0 text-xs text-pier-muted">This folder has a Dockerfile; pick Dockerfile to build with it instead.</p>
      )}
      <Field id="deploy-folder" label="Folder" hint="The build context. Use . for the repo root." error={form.errors.folder}>
        <Select id="deploy-folder" value={source.folder} onChange={(e) => { source.setFolder(e.target.value); form.clearError("folder"); }}>
          {folders.map((f) => <option key={f} value={f}>{f === "." ? ". (repo root)" : f}</option>)}
        </Select>
      </Field>
      {source.method === "dockerfile" && (
        <Field id="deploy-dockerfile" label="Dockerfile" hint={dockerfiles.length ? "Relative to the folder." : "None found in this folder; type its path relative to the folder."} error={form.errors.dockerfile}>
          {dockerfiles.length > 0 ? (
            <Select id="deploy-dockerfile" value={source.dockerfile} onChange={(e) => { source.setDockerfile(e.target.value); form.clearError("dockerfile"); }}>
              {dockerfiles.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          ) : (
            <Input id="deploy-dockerfile" value={source.dockerfile} onChange={(e) => { source.setDockerfile(e.target.value); form.clearError("dockerfile"); }} className="font-mono text-[12.5px]" invalid={Boolean(form.errors.dockerfile)} />
          )}
        </Field>
      )}
    </div>
  );
}
