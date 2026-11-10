import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createApp } from "../../api/client";
import { ApiError } from "../../api/errors";
import { validateDeployForm, type DeployFormValues, type FieldErrors } from "../../lib/deployValidation";
import { deployRedirectPath } from "../../lib/deploys";
import { mapApiErrorToFields } from "./errorMapping";
import type { AppResources, VolumeHint } from "../../api/types";
import { DEFAULT_RESOURCES } from "../../lib/resources";
import { useVolumeField } from "./useVolumeField";
import { useImageInspection } from "./useImageInspection";
import { useSourceFields } from "./useSourceFields";
import { useEnvRows } from "./useEnvRows";
import { useNameHost } from "./useNameHost";
import { errorsForStep, firstStepWithError, stepsFor, type SourceKind, type StepId } from "./wizardSteps";

export type SubmitState = "idle" | "pending" | "success" | "error_unreachable";

interface UseDeployFormOptions {
  ingressDomain: string | null;
  onShowToast: (opts: { title: string; description?: string; variant: "success" | "error" }) => void;
}

/** Typical listen ports: nginx-style images on 80, Railpack/app servers on 8080. */
const DEFAULT_PORT: Record<SourceKind, string> = { image: "80", repo: "8080" };

/**
 * State and submission for the deploy wizard (#83). Steps only validate; `submit` is the
 * one place that creates, and the wizard calls it only from Review's Deploy button.
 */
export function useDeployForm({ ingressDomain, onShowToast }: UseDeployFormOptions) {
  const navigate = useNavigate();
  const nameHost = useNameHost();
  const source = useSourceFields();
  const env = useEnvRows();
  const [image, setImage] = useState("");
  const [registry, setRegistry] = useState("");
  const [port, setPortState] = useState(DEFAULT_PORT.repo);
  const portEdited = useRef(false);
  const [replicas, setReplicas] = useState("1");
  const [resources, setResources] = useState<AppResources>(DEFAULT_RESOURCES);
  const volumes = useVolumeField(nameHost.name);
  const setInspectedPort = useCallback((next: string) => { if (!portEdited.current) setPortState(next); }, []);
  const imageInspection = useImageInspection(image, registry, setInspectedPort);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [deployedApp, setDeployedApp] = useState("");
  const navigateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setKind = useCallback((kind: SourceKind) => {
    source.setKind(kind);
    if (!portEdited.current) setPortState(DEFAULT_PORT[kind]);
  }, [source]);

  const values = useCallback((): DeployFormValues => ({
    name: nameHost.name, image, port, replicas, host: nameHost.subdomain, env: env.rows,
    publicUrl: nameHost.publicUrl, resources, volume: volumes.volume,
    registry: source.kind === "image" ? registry || undefined : undefined,
    source: source.body,
  }), [nameHost, image, port, replicas, env.rows, resources, volumes.volume, registry, source.kind, source.body]);

  /** Validate just this step's fields; Next stays on the step while any are wrong. */
  const validateStep = useCallback((step: StepId): boolean => {
    const result = validateDeployForm(values(), { ingressDomain });
    const stepErrors = result.ok ? {} : errorsForStep(result.errors, step);
    if (step === "connect" && source.kind === "repo" && !stepErrors.repo && !source.probe.result) {
      stepErrors.repo = "Load the repository first so Pier can list its branches";
    }
    setErrors(stepErrors);
    return Object.keys(stepErrors).length === 0;
  }, [values, ingressDomain, source.kind, source.probe.result]);

  /** Create the app. Returns the step to show when something needs fixing. */
  const submit = useCallback(async (): Promise<StepId | undefined> => {
    const steps = stepsFor(source.kind);
    const result = validateDeployForm(values(), { ingressDomain });
    if (!result.ok) {
      setErrors(result.errors);
      return firstStepWithError(result.errors, steps);
    }
    setErrors({});
    setSubmitState("pending");
    try {
      const app = await createApp(result.body);
      setDeployedApp(app.name);
      setSubmitState("success");
      onShowToast({ title: source.kind === "repo" ? `${app.name} is building` : `${app.name} is deploying`, variant: "success" });
      const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1500;
      navigateTimeoutRef.current = setTimeout(() => navigate(deployRedirectPath(app), { replace: true }), delay);
      return undefined;
    } catch (err) {
      if (!(err instanceof ApiError)) {
        onShowToast({ title: "Error", description: "An unexpected error occurred", variant: "error" });
        setSubmitState("idle");
        return "review";
      }
      const mapped = mapApiErrorToFields(err);
      setErrors(mapped);
      setSubmitState(err.kind === "unavailable" || err.kind === "network" ? "error_unreachable" : "idle");
      return firstStepWithError(mapped, steps);
    }
  }, [source.kind, values, ingressDomain, onShowToast, navigate]);

  useEffect(() => () => {
    if (navigateTimeoutRef.current !== null) clearTimeout(navigateTimeoutRef.current);
  }, []);

  // Suggestions from whichever source is active, minus dismissed ones and the path already mounted.
  const rawHints = source.kind === "image" ? imageInspection.hints : source.probe.hints;
  const hints = useMemo(
    () => rawHints.filter((h) => !dismissed.includes(h.path) && h.path !== volumes.volume?.mountPath),
    [rawHints, dismissed, volumes.volume?.mountPath],
  );

  /** Pre-fill the one #79 volume row; nothing is created until Deploy. */
  const addHint = useCallback((hint: VolumeHint) => {
    volumes.setMode("new");
    volumes.setVolume({ name: `${nameHost.name || "app"}-data`, mountPath: hint.path, size: volumes.volume?.size ?? "1Gi" });
    setReplicas("1");
  }, [volumes, nameHost.name]);

  const clearError = useCallback((field: keyof FieldErrors) => setErrors((prev) => {
    if (!prev[field]) return prev;
    const next = { ...prev };
    delete next[field];
    return next;
  }), []);

  return {
    ...nameHost,
    setName: (next: string) => { nameHost.setName(next); clearError("name"); },
    source, kind: source.kind, setKind,
    setRepo: (next: string) => { source.setRepo(next); clearError("repo"); },
    image, setImage: (next: string) => { setImage(next); clearError("image"); },
    registry, setRegistry,
    imageHint: imageInspection.hint, checkingImage: imageInspection.checking, checkImage: imageInspection.check,
    port, setPort: (next: string) => { portEdited.current = true; setPortState(next); clearError("port"); },
    replicas, setReplicas: (next: string) => { setReplicas(next); clearError("replicas"); },
    resources, setResources: (next: AppResources) => { setResources(next); clearError("resources"); },
    volumes,
    hints, hintsLoading: source.kind === "repo" && source.probe.hintsLoading,
    addHint, dismissHint: (path: string) => setDismissed((prev) => [...prev, path]),
    env,
    clearEnvRowError: (id: string) => setErrors((prev) => {
      if (!prev.env) return prev;
      const nextEnv = { ...prev.env };
      delete nextEnv[id];
      return { ...prev, env: Object.keys(nextEnv).length > 0 ? nextEnv : undefined };
    }),
    clearError,
    errors, submitState, deployedApp,
    validateStep, submit,
  };
}

export type DeployFormState = ReturnType<typeof useDeployForm>;
