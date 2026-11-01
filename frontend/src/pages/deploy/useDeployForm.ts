import { useRef, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../../api/client";
import { ApiError } from "../../api/errors";
import {
  validateDeployForm,
  type DeployFormValues,
  type FieldErrors,
} from "../../lib/deployValidation";
import { mapApiErrorToFields } from "./errorMapping";
import type { EnvRow } from "./EnvRows";

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

  // Validation/submission state
  const [touched, setTouched] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [deployedApp, setDeployedApp] = useState("");

  const nextEnvIdRef = useRef(2);
  const navigateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleNameChange = useCallback(
    (newName: string) => {
      setName(newName);
      if (nameFollowsSubdomain && publicUrl) {
        setSubdomain(newName.toLowerCase());
      }
      if (errors.name) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.name;
          return next;
        });
      }
    },
    [nameFollowsSubdomain, publicUrl, errors.name],
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

  const validate = useCallback((): boolean => {
    const values: DeployFormValues = {
      name,
      image,
      port,
      replicas,
      host: subdomain,
      env,
      publicUrl,
    };

    const result = validateDeployForm(values, { ingressDomain });
    if (!result.ok) {
      setErrors(result.errors);
      return false;
    }

    setErrors({});
    return true;
  }, [name, image, port, replicas, subdomain, env, publicUrl, ingressDomain]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setTouched(true);

      if (!validate()) {
        return;
      }

      setSubmitState("pending");
      try {
        const values: DeployFormValues = {
          name,
          image,
          port,
          replicas,
          host: subdomain,
          env,
          publicUrl,
        };

        const result = validateDeployForm(values, { ingressDomain });
        if (!result.ok) {
          setErrors(result.errors);
          setSubmitState("idle");
          return;
        }

        const app = await api.createApp(result.body);

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
          navigate(`/apps/${app.name}`, { replace: true });
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
    [validate, ingressDomain, name, image, port, replicas, subdomain, env, publicUrl, navigate, onShowToast],
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
      if (errors.image) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.image;
          return next;
        });
      }
    },
    port,
    setPort: (p: string) => {
      setPort(p);
      if (errors.port) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.port;
          return next;
        });
      }
    },
    replicas,
    setReplicas: (r: string) => {
      setReplicas(r);
      if (errors.replicas) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.replicas;
          return next;
        });
      }
    },
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
    clearHostError: () =>
      setErrors((prev) => {
        const next = { ...prev };
        delete next.host;
        return next;
      }),

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
