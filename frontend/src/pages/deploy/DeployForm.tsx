import { useEffect } from "react";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { HostField } from "./HostField";
import { EnvRows } from "./EnvRows";
import { DeployAlerts } from "./DeployAlerts";
import { DeploySuccess } from "./DeploySuccess";
import { useDeployForm } from "./useDeployForm";
import { ResourcesFields } from "../../components/apps/ResourcesFields";
import { VolumeFields } from "./VolumeFields";

interface Props {
  ingressDomain: string | null;
  /** App URLs are https:// (backend TLS on). */
  tls?: boolean;
  onCancel: () => void;
}

/**
 * Deploy form with validation, error mapping, and success state.
 */
export function DeployForm({ ingressDomain, tls = false, onCancel }: Props) {
  const { push: showToast } = useToast();

  const {
    name,
    setName,
    image,
    setImage,
    port,
    setPort,
    replicas,
    setReplicas,
    resources,
    setResources,
    publicUrl,
    setPublicUrl,
    subdomain,
    setSubdomain,
    env,
    setEnv,
    addEnvRow,
    removeEnvRow,
    clearEnvRowError,
    clearHostError,
    touched,
    errors,
    submitState,
    deployedApp,
    handleSubmit,
    clearNavigateTimeout,
    volume,
    setVolume,
    setVolumeName,
    volumeMode,
    setVolumeMode,
    availableVolumes,
    volumesLoading,
  } = useDeployForm({
    ingressDomain,
    onShowToast: showToast,
  });

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      clearNavigateTimeout();
    };
  }, [clearNavigateTimeout]);

  if (submitState === "success") {
    return <DeploySuccess appName={deployedApp} />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <DeployAlerts submitState={submitState} errors={errors} ingressDomain={ingressDomain} />

      {/* Name */}
      <Field
        id="deploy-name"
        label="App name"
        hint="Start with a lowercase letter, use lowercase letters, numbers, and hyphens only (≤63 chars)"
        error={touched ? errors.name : undefined}
      >
        <Input
          id="deploy-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {}}
          placeholder="demo"
          invalid={touched && Boolean(errors.name)}
        />
      </Field>

      {/* Image */}
      <Field
        id="deploy-image"
        label="Image"
        hint="e.g. nginx:1.27"
        error={touched ? errors.image : undefined}
      >
        <Input
          id="deploy-image"
          value={image}
          onChange={(e) => setImage(e.target.value)}
          onBlur={() => {}}
          placeholder="nginx:1.27"
          className="font-mono text-[12.5px]"
          invalid={touched && Boolean(errors.image)}
        />
      </Field>

      {/* Port */}
      <Field
        id="deploy-port"
        label="Port"
        hint="1–65535"
        error={touched ? errors.port : undefined}
      >
        <Input
          id="deploy-port"
          type="number"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          onBlur={() => {}}
          placeholder="80"
          invalid={touched && Boolean(errors.port)}
        />
      </Field>

      {/* Replicas */}
      <Field
        id="deploy-replicas"
        label="Replicas"
        hint={volume ? "Volume apps run at most 1 replica" : "0–10"}
        error={touched ? errors.replicas : undefined}
      >
        <Input
          id="deploy-replicas"
          type="number"
          value={replicas}
          onChange={(e) => setReplicas(e.target.value)}
          disabled={Boolean(volume)}
          onBlur={() => {}}
          placeholder="1"
          invalid={touched && Boolean(errors.replicas)}
        />
      </Field>

      {/* CPU & memory */}
      <ResourcesFields
        idPrefix="deploy"
        value={resources}
        onChange={setResources}
        errors={touched ? errors.resources : undefined}
      />
      <VolumeFields appName={name} volume={volume} mode={volumeMode} available={availableVolumes} loading={volumesLoading} errors={touched ? errors.volume : undefined} onModeChange={setVolumeMode} onNameChange={setVolumeName} onChange={(next) => {
        setVolume(next);
        if (next) setReplicas("1");
      }} />

      {/* Public URL */}
      {ingressDomain ? (
        <>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="deploy-public-url"
              checked={publicUrl}
              onChange={(e) => setPublicUrl(e.target.checked)}
              className="w-4 h-4 cursor-pointer"
            />
            <label
              htmlFor="deploy-public-url"
              className="text-[13px] font-medium text-pier-fg cursor-pointer"
            >
              Public URL
            </label>
          </div>
          {publicUrl && (
            <HostField
              id="deploy-host"
              subdomain={subdomain}
              ingressDomain={ingressDomain}
              tls={tls}
              onSubdomainChange={setSubdomain}
              onClearError={clearHostError}
              error={touched ? errors.host : undefined}
            />
          )}
        </>
      ) : (
        <div className="p-3 rounded-pier bg-pier-surface border border-pier-border">
          <p className="text-[12px] text-pier-muted m-0">
            Public URLs are off: <code className="font-mono">PIER_INGRESS_DOMAIN</code> isn't set on
            the backend.
          </p>
        </div>
      )}

      {/* Environment */}
      <EnvRows
        rows={env}
        errors={touched ? (errors.env as Record<string, string>) || {} : {}}
        onRowChange={setEnv}
        onRowRemove={removeEnvRow}
        onRowAdd={addEnvRow}
        onClearRowError={clearEnvRowError}
      />

      {/* Actions */}
      <div className="flex gap-2 pt-4">
        <Button
          type="submit"
          disabled={submitState === "pending" || (touched && Object.keys(errors).length > 0)}
        >
          {submitState === "pending" ? "Deploying..." : "Deploy"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
