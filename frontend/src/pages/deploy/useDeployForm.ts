import { useRef, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../../api/client";
import { ApiError } from "../../api/errors";
import { validateDeployForm, type DeployFormValues, type FieldErrors } from "../../lib/deployValidation";
import { deployRedirectPath } from "../../lib/deploys";
import { mapApiErrorToFields } from "./errorMapping";
import type { EnvRow } from "./EnvRows";
import type { AppResources, CreateAppBody } from "../../api/types";
import { DEFAULT_RESOURCES } from "../../lib/resources";
import { useVolumeField } from "./useVolumeField";

export type SubmitState = "idle" | "pending" | "success" | "error_unreachable";

interface UseDeployFormOptions {
  ingressDomain: string | null;
  onShowToast: (opts: {
    title: string;
    description?: string;
    variant: "success" | "error";
  }) => void;
}

/**
 * Hook encapsulating deploy form state and submission logic.
 */
export function useDeployForm({ ingressDomain, onShowToast }: UseDeployFormOptions) {
  const navigate = useNavigate();
  // Form field state
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [port, setPort] = useState("80");
  const [replicas, setReplicas] = useState("1");
  const [publicUrl, setPublicUrl] = useState(true);
  const [subdomain, setSubdomain] = useState("");
  const [nameFollowsSubdomain, setNameFollowsSubdomain] = useState(true);
  const [env, setEnv] = useState<EnvRow[]>([{ id: "1", key: "", value: "" }]);
  const [resources, setResources] = useState<AppResources>(DEFAULT_RESOURCES);
  const { volume, mode, setMode, available, loading, setVolume, setVolumeName } = useVolumeField(name);
  // Validation/submission state
  const [touched, setTouched] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [deployedApp, setDeployedApp] = useState("");
  const nextEnvIdRef = useRef(2);
  const navigateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Drop one field's error once the user edits it. */
  const clearError = useCallback((field: keyof FieldErrors) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);
  const handleNameChange = useCallback(
    (newName: string) => {
      setName(newName);
      if (nameFollowsSubdomain && publicUrl) {
        setSubdomain(newName.toLowerCase());
      }
      clearError("name");
    },
    [nameFollowsSubdomain, publicUrl, clearError],
  );

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
  /** Validate the form; returns the request body, or undefined after setting field errors. */
  const validate = useCallback((): CreateAppBody | undefined => {
    const values: DeployFormValues = {
      name,
      image,
      port,
      replicas,
      host: subdomain,
      env,
      publicUrl,
      resources,
      volume,
    };

    const result = validateDeployForm(values, { ingressDomain });
    if (!result.ok) {
      setErrors(result.errors);
      return undefined;
    }

    setErrors({});
    return result.body;
  }, [name, image, port, replicas, subdomain, env, publicUrl, resources, volume, ingressDomain]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setTouched(true);

      const body = validate();
      if (!body) {
        return;
      }

      setSubmitState("pending");
      try {
        const app = await api.createApp(body);

        setDeployedApp(app.name);
        setSubmitState("success");

        onShowToast({
          title: `${app.name} is deploying`,
          variant: "success",
        });

        // Auto-navigate after 1.5s (or immediately under prefers-reduced-motion).
        const prefersReduced = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;
        const delay = prefersReduced ? 0 : 1500;

        navigateTimeoutRef.current = setTimeout(() => {
          navigate(deployRedirectPath(app), { replace: true });
        }, delay) as ReturnType<typeof setTimeout>;
      } catch (err) {
        if (err instanceof ApiError) {
          const newErrors = mapApiErrorToFields(err);
          setErrors(newErrors);

          if (err.kind === "unavailable" || err.kind === "network") {
            setSubmitState("error_unreachable");
          } else {
            setSubmitState("idle");
          }
        } else {
          onShowToast({
            title: "Error",
            description: "An unexpected error occurred",
            variant: "error",
          });
          setSubmitState("idle");
        }
      }
    },
    [validate, navigate, onShowToast],
  );

  // Focus first error field on validation failure
  useEffect(() => {
    if (touched && Object.keys(errors).length > 0) {
      const firstErrorKey = Object.keys(errors)[0];
      if (firstErrorKey && firstErrorKey !== "form" && firstErrorKey !== "env") {
        setTimeout(() => {
          const input = document.getElementById(`deploy-${firstErrorKey}`);
          input?.focus();
        }, 0);
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
    // Form state
    name,
    setName: handleNameChange,
    image,
    setImage: (img: string) => {
      setImage(img);
      clearError("image");
    },
    port,
    setPort: (p: string) => {
      setPort(p);
      clearError("port");
    },
    replicas,
    setReplicas: (r: string) => {
      setReplicas(r);
      clearError("replicas");
    },
    resources,
    setResources: (r: AppResources) => {
      setResources(r);
      clearError("resources");
    },
    volume,
    setVolume,
    setVolumeName,
    volumeMode: mode,
    setVolumeMode: setMode,
    availableVolumes: available,
    volumesLoading: loading,
    publicUrl,
    setPublicUrl: handlePublicUrlChange,
    subdomain,
    setSubdomain: handleSubdomainChange,
    nameFollowsSubdomain,
    env,
    setEnv: handleEnvRowChange,
    addEnvRow: handleEnvRowAdd,
    removeEnvRow: handleEnvRowRemove,
    clearEnvRowError: (id: string) =>
      setErrors((prev) => {
        if (!prev.env) return prev;
        const newEnv = { ...prev.env };
        delete newEnv[id];
        return { ...prev, env: Object.keys(newEnv).length > 0 ? newEnv : undefined };
      }),
    clearHostError: () => clearError("host"),

    // Submission state
    touched,
    errors,
    submitState,
    deployedApp,

    // Handlers
    handleSubmit,
    clearNavigateTimeout,
  };
}
