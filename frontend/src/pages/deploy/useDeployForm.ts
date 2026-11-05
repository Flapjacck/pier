import { useRef, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createApp } from "../../api/client";
import { ApiError } from "../../api/errors";
import { validateDeployForm, type DeployFormValues, type FieldErrors } from "../../lib/deployValidation";
import { deployRedirectPath } from "../../lib/deploys";
import { mapApiErrorToFields } from "./errorMapping";
import type { EnvRow } from "./EnvRows";
import type { AppResources, CreateAppBody } from "../../api/types";
import { DEFAULT_RESOURCES } from "../../lib/resources";
import { useVolumeField } from "./useVolumeField";
import { useImageInspection } from "./useImageInspection";
import { useSourceMode } from "./useSourceMode";

export type SubmitState = "idle" | "pending" | "success" | "error_unreachable";

interface UseDeployFormOptions {
  ingressDomain: string | null;
  onShowToast: (opts: {
    title: string;
    description?: string;
    variant: "success" | "error";
  }) => void;
}

/** Deploy form state and submission (image or Dockerfile source). */
export function useDeployForm({ ingressDomain, onShowToast }: UseDeployFormOptions) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [registry, setRegistry] = useState("");
  const [port, setPort] = useState("80");
  const [replicas, setReplicas] = useState("1");
  const [publicUrl, setPublicUrl] = useState(true);
  const [subdomain, setSubdomain] = useState("");
  const [nameFollowsSubdomain, setNameFollowsSubdomain] = useState(true);
  const [env, setEnv] = useState<EnvRow[]>([{ id: "1", key: "", value: "" }]);
  const [resources, setResources] = useState<AppResources>(DEFAULT_RESOURCES);
  const [touched, setTouched] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [deployedApp, setDeployedApp] = useState("");
  const nextEnvIdRef = useRef(2);
  const navigateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearError = useCallback((field: keyof FieldErrors) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const {
    deployMode, setDeployMode, repo, setRepo, branch, setBranch,
    folder, setFolder, dockerfile, setDockerfile, gitCredential, setGitCredential,
  } = useSourceMode(clearError);

  const { volume, mode, setMode, available, loading, setVolume, setVolumeName } = useVolumeField(name);
  const imageInspection = useImageInspection(image, registry, name, (next) => {
    setPort((current) => (current === "" || current === "80" ? next : current));
  }, (next) => { if (!volume) setVolume(next); }, setMode);

  const handleNameChange = useCallback((newName: string) => {
    setName(newName);
    if (nameFollowsSubdomain && publicUrl) setSubdomain(newName.toLowerCase());
    clearError("name");
  }, [nameFollowsSubdomain, publicUrl, clearError]);

  const handleSubdomainChange = useCallback((newSubdomain: string) => {
    setSubdomain(newSubdomain);
    setNameFollowsSubdomain(false);
  }, []);

  const handlePublicUrlChange = useCallback((checked: boolean) => {
    setPublicUrl(checked);
    if (checked) {
      setSubdomain(name.toLowerCase());
      setNameFollowsSubdomain(true);
    }
  }, [name]);

  const handleEnvRowChange = useCallback((row: EnvRow) => {
    setEnv((prev) => prev.map((r) => (r.id === row.id ? row : r)));
  }, []);
  const handleEnvRowRemove = useCallback((id: string) => {
    setEnv((prev) => prev.filter((r) => r.id !== id));
  }, []);
  const handleEnvRowAdd = useCallback(() => {
    const newId = String(nextEnvIdRef.current++);
    setEnv((prev) => [...prev, { id: newId, key: "", value: "" }]);
  }, []);

  const validate = useCallback((): CreateAppBody | undefined => {
    const values: DeployFormValues = {
      name, image, port, replicas, host: subdomain, env, publicUrl, resources, volume,
      registry: registry || undefined, mode: deployMode, repo, branch, folder, dockerfile,
      gitCredential: gitCredential || undefined,
    };
    const result = validateDeployForm(values, { ingressDomain });
    if (!result.ok) {
      setErrors(result.errors);
      return undefined;
    }
    setErrors({});
    return result.body;
  }, [name, image, port, replicas, subdomain, env, publicUrl, resources, volume, registry,
    deployMode, repo, branch, folder, dockerfile, gitCredential, ingressDomain]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const body = validate();
    if (!body) return;
    setSubmitState("pending");
    try {
      const app = await createApp(body);
      setDeployedApp(app.name);
      onShowToast({ title: `${app.name} is deploying`, variant: "success" });
      // Source builds return before Kaniko finishes — go straight to live deploy logs.
      if (body.source && app.deploymentId !== undefined) {
        navigate(deployRedirectPath(app), { replace: true });
        return;
      }
      setSubmitState("success");
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      navigateTimeoutRef.current = setTimeout(() => {
        navigate(deployRedirectPath(app), { replace: true });
      }, prefersReduced ? 0 : 1500) as ReturnType<typeof setTimeout>;
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(mapApiErrorToFields(err));
        setSubmitState(err.kind === "unavailable" || err.kind === "network" ? "error_unreachable" : "idle");
      } else {
        onShowToast({ title: "Error", description: "An unexpected error occurred", variant: "error" });
        setSubmitState("idle");
      }
    }
  }, [validate, navigate, onShowToast]);

  useEffect(() => {
    if (touched && Object.keys(errors).length > 0) {
      const firstErrorKey = Object.keys(errors)[0];
      if (firstErrorKey && firstErrorKey !== "form" && firstErrorKey !== "env") {
        setTimeout(() => document.getElementById(`deploy-${firstErrorKey}`)?.focus(), 0);
      }
    }
  }, [touched, errors]);

  const clearNavigateTimeout = useCallback(() => {
    if (navigateTimeoutRef.current !== null) {
      clearTimeout(navigateTimeoutRef.current);
      navigateTimeoutRef.current = null;
    }
  }, []);

  return {
    name, setName: handleNameChange,
    image, setImage: (img: string) => { setImage(img); clearError("image"); },
    registry, setRegistry: (value: string) => setRegistry(value),
    deployMode, setDeployMode, repo, setRepo, branch, setBranch,
    folder, setFolder, dockerfile, setDockerfile, gitCredential, setGitCredential,
    imageHint: imageInspection.hint, checkingImage: imageInspection.checking, checkImage: imageInspection.check,
    port, setPort: (p: string) => { setPort(p); clearError("port"); },
    replicas, setReplicas: (r: string) => { setReplicas(r); clearError("replicas"); },
    resources, setResources: (r: AppResources) => { setResources(r); clearError("resources"); },
    volume, setVolume, setVolumeName, volumeMode: mode, setVolumeMode: setMode,
    availableVolumes: available, volumesLoading: loading,
    publicUrl, setPublicUrl: handlePublicUrlChange, subdomain, setSubdomain: handleSubdomainChange,
    nameFollowsSubdomain, env, setEnv: handleEnvRowChange, addEnvRow: handleEnvRowAdd,
    removeEnvRow: handleEnvRowRemove,
    clearEnvRowError: (id: string) => setErrors((prev) => {
      if (!prev.env) return prev;
      const newEnv = { ...prev.env };
      delete newEnv[id];
      return { ...prev, env: Object.keys(newEnv).length > 0 ? newEnv : undefined };
    }),
    clearHostError: () => clearError("host"),
    touched, errors, submitState, deployedApp, handleSubmit, clearNavigateTimeout,
  };
}
