import { cn } from "../../../lib/cn";
import type { DeployFormState } from "../useDeployForm";
import type { SourceKind } from "../wizardSteps";

const OPTIONS: { kind: SourceKind; title: string; body: string }[] = [
  { kind: "repo", title: "Git repository", body: "Paste a repo; Pier builds it with Railpack or your Dockerfile." },
  { kind: "image", title: "Pre-built image", body: "Run an image that's already in a registry, like nginx:1.27." },
];

export function SourceStep({ form }: { form: DeployFormState }) {
  return (
    <fieldset className="m-0 p-0 border-0 space-y-2">
      <legend className="text-[13px] font-medium text-pier-fg mb-2">Where does the app come from?</legend>
      {OPTIONS.map((option) => (
        <label
          key={option.kind}
          className={cn(
            "flex gap-3 items-start p-3 rounded-pier border cursor-pointer",
            form.kind === option.kind ? "border-pier-accent bg-pier-surface" : "border-pier-border",
          )}
        >
          <input type="radio" name="deploy-source" value={option.kind} checked={form.kind === option.kind} onChange={() => form.setKind(option.kind)} className="mt-1" />
          <span>
            <span className="block text-sm font-medium text-pier-fg">{option.title}</span>
            <span className="block text-xs text-pier-muted">{option.body}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
