import { useEffect, useMemo, useState } from "react";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { useToast } from "../../components/ui/Toast";
import { HostField } from "./HostField";
import { EnvRows } from "./EnvRows";
import { DeployAlerts } from "./DeployAlerts";
import { DeploySuccess } from "./DeploySuccess";
import { useDeployForm } from "./useDeployForm";
import { ResourcesFields } from "../../components/apps/ResourcesFields";
import { VolumeFields } from "./VolumeFields";
import { listRegistries } from "../../api/registries";
import { listGitCredentials } from "../../api/gitCredentials";
import { probeGitRepo } from "../../api/gitProbe";
import { ApiError } from "../../api/errors";
import { useApi } from "../../hooks/useApi";
import { useCallback } from "react";
import { StepIndicator } from "./wizard/StepIndicator";
import { SourceTypeStep, type SourceChoice } from "./wizard/SourceTypeStep";
import { BuildMethodStep } from "./wizard/BuildMethodStep";

interface Props {
  ingressDomain: string | null;
  tls?: boolean;
  onCancel: () => void;
}

const STEPS_GIT = [
  { id: "app", label: "App" },
  { id: "source", label: "Source" },
  { id: "connect", label: "Connect" },
  { id: "build", label: "Build" },
  { id: "runtime", label: "Runtime" },
  { id: "review", label: "Review" },
] as const;

const STEPS_IMAGE = [
  { id: "app", label: "App" },
  { id: "source", label: "Source" },
  { id: "connect", label: "Connect" },
  { id: "runtime", label: "Runtime" },
  { id: "review", label: "Review" },
] as const;

/**
 * Multi-step deploy wizard (git Dockerfile or image). Railpack/BuildKit are shown disabled (#104).
 */
export function DeployForm({ ingressDomain, tls = false, onCancel }: Props) {
  const { push: showToast } = useToast();
  const [step, setStep] = useState(0);
  const [sourceChoice, setSourceChoice] = useState<SourceChoice>("git");
  const [probeError, setProbeError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [folders, setFolders] = useState<string[]>(["."]);

  const form = useDeployForm({ ingressDomain, onShowToast: showToast });
  const {
    name, setName, image, setImage, port, setPort, replicas, setReplicas, resources, setResources,
    publicUrl, setPublicUrl, subdomain, setSubdomain, env, setEnv, addEnvRow, removeEnvRow,
    clearEnvRowError, clearHostError, touched, errors, submitState, deployedApp, handleSubmit,
    clearNavigateTimeout, volume, setVolume, setVolumeName, volumeMode, setVolumeMode,
    availableVolumes, volumesLoading, registry, setRegistry, deployMode, setDeployMode,
    repo, setRepo, branch, setBranch, folder, setFolder, dockerfile, setDockerfile,
    gitCredential, setGitCredential, imageHint, checkingImage, checkImage,
  } = form;

  const registryFetcher = useCallback((signal: AbortSignal) => listRegistries({ signal }), []);
  const gitFetcher = useCallback((signal: AbortSignal) => listGitCredentials({ signal }), []);
  const { data: registries = [] } = useApi(registryFetcher, []);
  const { data: credentials = [] } = useApi(gitFetcher, []);

  const steps = sourceChoice === "image" ? STEPS_IMAGE : STEPS_GIT;
  const stepId = steps[Math.min(step, steps.length - 1)]!.id;

  useEffect(() => {
    return () => clearNavigateTimeout();
  }, [clearNavigateTimeout]);

  useEffect(() => {
    if (sourceChoice === "git") setDeployMode("dockerfile");
    else if (sourceChoice === "image") setDeployMode("image");
  }, [sourceChoice, setDeployMode]);

  const stepErrors = useMemo(() => {
    if (!touched && stepId !== "review") return {} as typeof errors;
    return errors;
  }, [touched, errors, stepId]);

  function canNext(): boolean {
    if (stepId === "app") {
      if (!name.trim()) return false;
      if (errors.name) return false;
      if (publicUrl && ingressDomain && !subdomain.trim()) return false;
      return true;
    }
    if (stepId === "source") return sourceChoice === "git" || sourceChoice === "image";
    if (stepId === "connect") {
      if (deployMode === "dockerfile") return Boolean(repo.trim()) && !errors.repo;
      return Boolean(image.trim()) && !errors.image;
    }
    if (stepId === "build") return Boolean((branch || "main").trim()) && Boolean((dockerfile || "Dockerfile").trim());
    return true;
  }

  async function runProbe() {
    setProbeError(null);
    setProbing(true);
    try {
      const result = await probeGitRepo({
        repo: repo.trim(),
        ...(gitCredential ? { gitCredential } : {}),
      });
      setBranches(result.branches);
      setFolders(result.folders.length ? result.folders : ["."]);
      if (!branch.trim() || !result.branches.includes(branch)) setBranch(result.defaultBranch);
      if (!folder.trim()) setFolder(result.folders.includes(".") ? "." : (result.folders[0] ?? "."));
      showToast({ title: "Repository loaded", description: `${result.branches.length} branches`, variant: "success" });
    } catch (err) {
      const message = err instanceof ApiError
        ? (err.details ? `${err.error}: ${err.details}` : err.error)
        : err instanceof Error ? err.message : "Could not probe repository";
      setProbeError(message);
      setBranches([]);
      setFolders(["."]);
    } finally {
      setProbing(false);
    }
  }

  if (submitState === "success") {
    return <DeploySuccess appName={deployedApp} />;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // Only the review step may create the app (avoids Enter on earlier fields).
        if (stepId !== "review" || submitState === "pending") return;
        void handleSubmit(e);
      }}
      className="space-y-4 max-w-2xl"
    >
      <StepIndicator steps={[...steps]} current={step} />
      <DeployAlerts submitState={submitState} errors={errors} ingressDomain={ingressDomain} />

      {stepId === "app" && (
        <div className="space-y-4">
          <Field id="deploy-name" label="App name" hint="Start with a lowercase letter, use lowercase letters, numbers, and hyphens only (≤63 chars)" error={stepErrors.name}>
            <Input id="deploy-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="demo" invalid={Boolean(stepErrors.name)} />
          </Field>
          {ingressDomain ? (
            <>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="deploy-public-url" checked={publicUrl} onChange={(e) => setPublicUrl(e.target.checked)} className="w-4 h-4 cursor-pointer" />
                <label htmlFor="deploy-public-url" className="text-[13px] font-medium text-pier-fg cursor-pointer">Public URL</label>
              </div>
              {publicUrl && (
                <HostField id="deploy-host" subdomain={subdomain} ingressDomain={ingressDomain} tls={tls} onSubdomainChange={setSubdomain} onClearError={clearHostError} error={stepErrors.host} />
              )}
            </>
          ) : (
            <div className="p-3 rounded-pier bg-pier-surface border border-pier-border">
              <p className="text-[12px] text-pier-muted m-0">
                Public URLs are off: <code className="font-mono">PIER_INGRESS_DOMAIN</code> isn't set on the backend.
              </p>
            </div>
          )}
        </div>
      )}

      {stepId === "source" && (
        <SourceTypeStep value={sourceChoice} onChange={setSourceChoice} />
      )}

      {stepId === "connect" && deployMode === "dockerfile" && (
        <div className="space-y-4">
          <Field id="deploy-repo" label="Git repository" hint="https:// or git@ URL" error={stepErrors.repo}>
            <Input id="deploy-repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="https://github.com/org/app" className="font-mono text-[12.5px]" invalid={Boolean(stepErrors.repo)} />
          </Field>
          <Field id="deploy-git-credential" label="Git credential" hint="Optional — for private repos">
            <Select id="deploy-git-credential" value={gitCredential} onChange={(e) => setGitCredential(e.target.value)}>
              <option value="">None (public)</option>
              {credentials.map((c) => (
                <option key={c.name} value={c.name}>{c.name} ({c.username})</option>
              ))}
            </Select>
          </Field>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={!repo.trim() || probing} onClick={() => void runProbe()}>
              {probing ? "Loading…" : "Load repository"}
            </Button>
            {probeError && <p className="m-0 text-xs text-pier-status-failed">{probeError}</p>}
          </div>
        </div>
      )}

      {stepId === "connect" && deployMode === "image" && (
        <div className="space-y-4">
          <Field id="deploy-image" label="Image" hint="e.g. nginx:1.27" error={stepErrors.image}>
            <Input id="deploy-image" value={image} onChange={(e) => setImage(e.target.value)} placeholder="nginx:1.27" className="font-mono text-[12.5px]" invalid={Boolean(stepErrors.image)} />
          </Field>
          <Field id="deploy-registry" label="Registry" hint="Credentials for private pulls">
            <Select id="deploy-registry" value={registry} onChange={(e) => setRegistry(e.target.value)}>
              <option value="">None</option>
              {registries.map((r) => (
                <option key={r.name} value={r.name}>{r.name}</option>
              ))}
            </Select>
          </Field>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={!image.trim() || checkingImage} onClick={() => void checkImage()}>
              {checkingImage ? "Checking…" : "Check image"}
            </Button>
            {imageHint && <p className="m-0 text-xs text-pier-muted">{imageHint}</p>}
          </div>
        </div>
      )}

      {stepId === "build" && (
        <div className="space-y-4">
          <BuildMethodStep />
          <Field id="deploy-branch" label="Branch" error={stepErrors.branch}>
            {branches.length > 0 ? (
              <Select id="deploy-branch" value={branch} onChange={(e) => setBranch(e.target.value)}>
                {branches.map((b) => <option key={b} value={b}>{b}</option>)}
              </Select>
            ) : (
              <Input id="deploy-branch" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
            )}
          </Field>
          <Field id="deploy-folder" label="Folder" hint="Repo root is ." error={stepErrors.folder}>
            {folders.length > 1 ? (
              <Select id="deploy-folder" value={folder} onChange={(e) => setFolder(e.target.value)}>
                {folders.map((f) => <option key={f} value={f}>{f}</option>)}
              </Select>
            ) : (
              <Input id="deploy-folder" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="." />
            )}
          </Field>
          <Field id="deploy-dockerfile" label="Dockerfile" error={stepErrors.dockerfile}>
            <Input id="deploy-dockerfile" value={dockerfile} onChange={(e) => setDockerfile(e.target.value)} placeholder="Dockerfile" />
          </Field>
        </div>
      )}

      {stepId === "runtime" && (
        <div className="space-y-4">
          <Field id="deploy-port" label="Port" hint="1–65535" error={stepErrors.port}>
            <Input id="deploy-port" type="number" value={port} onChange={(e) => setPort(e.target.value)} placeholder="80" invalid={Boolean(stepErrors.port)} />
          </Field>
          <Field id="deploy-replicas" label="Replicas" hint={volume ? "Volume apps run at most 1 replica" : "0–10"} error={stepErrors.replicas}>
            <Input id="deploy-replicas" type="number" value={replicas} onChange={(e) => setReplicas(e.target.value)} disabled={Boolean(volume)} placeholder="1" invalid={Boolean(stepErrors.replicas)} />
          </Field>
          <ResourcesFields idPrefix="deploy" value={resources} onChange={setResources} errors={stepErrors.resources} />
          <VolumeFields appName={name} volume={volume} mode={volumeMode} available={availableVolumes} loading={volumesLoading} errors={stepErrors.volume} onModeChange={setVolumeMode} onNameChange={setVolumeName} onChange={(next) => { setVolume(next); if (next) setReplicas("1"); }} />
          <EnvRows rows={env} errors={(stepErrors.env as Record<string, string>) || {}} onRowChange={setEnv} onRowRemove={removeEnvRow} onRowAdd={addEnvRow} onClearRowError={clearEnvRowError} />
        </div>
      )}

      {stepId === "review" && (
        <div className="space-y-3 rounded-pier-lg border border-pier-border bg-pier-surface p-4 text-sm">
          <p className="m-0"><span className="text-pier-muted">App</span> · <strong>{name || "—"}</strong></p>
          {publicUrl && subdomain && ingressDomain && (
            <p className="m-0"><span className="text-pier-muted">URL</span> · {tls ? "https" : "http"}://{subdomain}.{ingressDomain}</p>
          )}
          <p className="m-0"><span className="text-pier-muted">Source</span> · {deployMode === "dockerfile" ? `Git · ${repo || "—"}` : `Image · ${image || "—"}`}</p>
          {deployMode === "dockerfile" && (
            <p className="m-0 text-pier-muted">{branch || "main"} / {folder || "."} / {dockerfile || "Dockerfile"}</p>
          )}
          <p className="m-0"><span className="text-pier-muted">Port</span> · {port} · <span className="text-pier-muted">Replicas</span> · {replicas}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-4">
        {step > 0 && (
          <Button type="button" variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))}>
            Back
          </Button>
        )}
        {step < steps.length - 1 ? (
          <Button
            type="button"
            disabled={!canNext()}
            onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
          >
            Next
          </Button>
        ) : (
          <Button
            type="button"
            disabled={submitState === "pending" || (touched && Object.keys(errors).length > 0)}
            onClick={() => { void handleSubmit(); }}
          >
            {submitState === "pending" ? "Deploying…" : "Deploy"}
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
