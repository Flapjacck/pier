import { useCallback } from "react";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { listRegistries } from "../../api/registries";
import { listGitCredentials } from "../../api/gitCredentials";
import { useApi } from "../../hooks/useApi";
import type { DeployMode, FieldErrors } from "../../lib/deployValidation";

type Props = {
  mode: DeployMode;
  onModeChange: (mode: DeployMode) => void;
  image: string;
  onImageChange: (value: string) => void;
  registry: string;
  onRegistryChange: (value: string) => void;
  imageHint?: string | null;
  checkingImage: boolean;
  onCheckImage: () => void;
  repo: string;
  onRepoChange: (value: string) => void;
  branch: string;
  onBranchChange: (value: string) => void;
  folder: string;
  onFolderChange: (value: string) => void;
  dockerfile: string;
  onDockerfileChange: (value: string) => void;
  gitCredential: string;
  onGitCredentialChange: (value: string) => void;
  touched: boolean;
  errors: FieldErrors;
};

/** Image vs Dockerfile source switch for the deploy form (#83). */
export function SourceFields(props: Props) {
  const registryFetcher = useCallback((signal: AbortSignal) => listRegistries({ signal }), []);
  const gitFetcher = useCallback((signal: AbortSignal) => listGitCredentials({ signal }), []);
  const { data: registries = [] } = useApi(registryFetcher, []);
  const { data: credentials = [] } = useApi(gitFetcher, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="group" aria-label="Deploy source">
        <Button
          type="button"
          size="sm"
          variant={props.mode === "image" ? "primary" : "secondary"}
          onClick={() => props.onModeChange("image")}
        >
          Image
        </Button>
        <Button
          type="button"
          size="sm"
          variant={props.mode === "dockerfile" ? "primary" : "secondary"}
          onClick={() => props.onModeChange("dockerfile")}
        >
          Dockerfile
        </Button>
      </div>

      {props.mode === "image" ? (
        <>
          <Field id="deploy-image" label="Image" hint="e.g. nginx:1.27" error={props.touched ? props.errors.image : undefined}>
            <div>
              <Input
                id="deploy-image"
                value={props.image}
                onChange={(e) => props.onImageChange(e.target.value)}
                placeholder="nginx:1.27"
                className="font-mono text-[12.5px]"
                invalid={props.touched && Boolean(props.errors.image)}
              />
              <div className="flex items-center gap-2 mt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void props.onCheckImage()}
                  disabled={props.checkingImage || !props.image.trim()}
                >
                  {props.checkingImage ? "Checking…" : "Check image"}
                </Button>
                {props.imageHint && <span className="text-xs text-pier-muted">{props.imageHint}</span>}
              </div>
            </div>
          </Field>
          {registries.length > 0 && (
            <Field id="deploy-registry" label="Registry" hint="Credentials are never shown again.">
              <Select id="deploy-registry" value={props.registry} onChange={(e) => props.onRegistryChange(e.target.value)}>
                <option value="">Public / anonymous</option>
                {registries.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} ({item.server})
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </>
      ) : (
        <>
          <Field id="deploy-repo" label="Git repository" hint="https:// or git@ URL" error={props.touched ? props.errors.repo : undefined}>
            <Input
              id="deploy-repo"
              value={props.repo}
              onChange={(e) => props.onRepoChange(e.target.value)}
              placeholder="https://github.com/org/app.git"
              className="font-mono text-[12.5px]"
              invalid={props.touched && Boolean(props.errors.repo)}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field id="deploy-branch" label="Branch">
              <Input id="deploy-branch" value={props.branch} onChange={(e) => props.onBranchChange(e.target.value)} placeholder="main" />
            </Field>
            <Field id="deploy-folder" label="Folder" hint="Repo root is ." error={props.touched ? props.errors.folder : undefined}>
              <Input
                id="deploy-folder"
                value={props.folder}
                onChange={(e) => props.onFolderChange(e.target.value)}
                placeholder="."
                className="font-mono text-[12.5px]"
                invalid={props.touched && Boolean(props.errors.folder)}
              />
            </Field>
            <Field id="deploy-dockerfile" label="Dockerfile" error={props.touched ? props.errors.dockerfile : undefined}>
              <Input
                id="deploy-dockerfile"
                value={props.dockerfile}
                onChange={(e) => props.onDockerfileChange(e.target.value)}
                placeholder="Dockerfile"
                className="font-mono text-[12.5px]"
                invalid={props.touched && Boolean(props.errors.dockerfile)}
              />
            </Field>
          </div>
          {credentials.length > 0 && (
            <Field id="deploy-git-credential" label="Git credential" hint="Optional, for private repos.">
              <Select
                id="deploy-git-credential"
                value={props.gitCredential}
                onChange={(e) => props.onGitCredentialChange(e.target.value)}
              >
                <option value="">None (public)</option>
                {credentials.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} ({item.username})
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </>
      )}
    </div>
  );
}
