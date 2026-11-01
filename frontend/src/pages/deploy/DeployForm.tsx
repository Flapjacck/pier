import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../../api/client";
import { ApiError } from "../../api/errors";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { ThemeIllustration } from "../../components/brand/ThemeIllustration";
import { HostField } from "./HostField";
import { EnvRows, type EnvRow } from "./EnvRows";
import {
  validateDeployForm,
  type DeployFormValues,
  type FieldErrors,
} from "../../lib/deployValidation";
import { mapApiErrorToFields } from "./errorMapping";

interface Props {
  ingressDomain: string | null;
  onCancel: () => void;
}

type SubmitState = "idle" | "pending" | "success" | "error_unreachable";

/**
 * Deploy form with validation, error mapping, and success state.
 */
export function DeployForm({ ingressDomain, onCancel }: Props) {
  const navigate = useNavigate();
  const { push: showToast } = useToast();

  // Form state
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [port, setPort] = useState("80");
  const [replicas, setReplicas] = useState("1");
  const [publicUrl, setPublicUrl] = useState(true);
  const [subdomain, setSubdomain] = useState("");
  const [nameFollowsSubdomain, setNameFollowsSubdomain] = useState(true);
  const [env, setEnv] = useState<EnvRow[]>([
    { id: "1", key: "", value: "" },
  ]);

  // Validation state
  const [touched, setTouched] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [deployedApp, setDeployedApp] = useState("");

  const nextEnvIdRef = useRef(2);

  // When name changes and we're still following subdomain, update subdomain to match.
  const handleNameChange = (newName: string) => {
    setName(newName);
    if (nameFollowsSubdomain && publicUrl) {
      setSubdomain(newName.toLowerCase());
    }
    // Clear name error as user types
    if (errors.name) {
      setErrors((prev) => ({ ...prev, name: undefined }));
    }
  };

  // When subdomain is manually edited, stop following the name.
  const handleSubdomainChange = (newSubdomain: string) => {
    setSubdomain(newSubdomain);
    setNameFollowsSubdomain(false);
  };

  // When publicUrl is toggled, sync subdomain to name (if turning on).
  const handlePublicUrlChange = (checked: boolean) => {
    setPublicUrl(checked);
    if (checked) {
      setSubdomain(name.toLowerCase());
      setNameFollowsSubdomain(true);
    }
  };

  const handleEnvRowChange = (row: EnvRow) => {
    setEnv((prev) => prev.map((r) => (r.id === row.id ? row : r)));
  };

  const handleEnvRowRemove = (id: string) => {
    setEnv((prev) => prev.filter((r) => r.id !== id));
  };

  const handleEnvRowAdd = () => {
    const newId = String(nextEnvIdRef.current++);
    setEnv((prev) => [...prev, { id: newId, key: "", value: "" }]);
  };

  const validate = (): boolean => {
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);

    if (!validate()) {
      // Focus the first error field.
      const firstErrorKey = Object.keys(errors)[0];
      if (firstErrorKey && firstErrorKey !== "env") {
        const input = document.getElementById(`deploy-${firstErrorKey}`);
        input?.focus();
      }
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

      const app = await api.createApp(result.body as api.CreateAppBody);

      setDeployedApp(app.name);
      setSubmitState("success");

      showToast({
        title: `${app.name} is deploying`,
        variant: "success",
      });

      // Auto-navigate after 1.5s (or immediately under prefers-reduced-motion).
      const prefersReduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      const delay = prefersReduced ? 0 : 1500;

      setTimeout(() => {
        navigate(`/apps/${app.name}`, { replace: true });
      }, delay);
    } catch (err) {
      if (err instanceof ApiError) {
        // Map errors to fields.
        const newErrors = mapApiErrorToFields(err);
        setErrors(newErrors);

        if (err.kind === "unavailable" || err.kind === "network") {
          setSubmitState("error_unreachable");
        } else {
          setSubmitState("idle");
        }
      } else {
        showToast({
          title: "Error",
          description: "An unexpected error occurred",
          variant: "error",
        });
        setSubmitState("idle");
      }
    }
  };

  // On first error after submit, focus it.
  useEffect(() => {
    if (touched && Object.keys(errors).length > 0) {
      const firstErrorKey = Object.keys(errors)[0];
      if (firstErrorKey && firstErrorKey !== "env") {
        setTimeout(() => {
          const input = document.getElementById(`deploy-${firstErrorKey}`);
          input?.focus();
        }, 0);
      }
    }
  }, [touched, errors]);

  if (submitState === "success") {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <ThemeIllustration
          base="deployed-colour"
          alt="Success illustration"
          width={240}
        />
        <div>
          <p className="text-sm m-0">
            <strong className="text-pier-fg">{deployedApp} is deploying</strong>
            <br />
            <span className="text-pier-muted">
              Check back in a moment to see the status.
            </span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      {/* Form-level error alert */}
      {submitState === "error_unreachable" && (
        <div
          role="alert"
          className="p-3 rounded-pier bg-pier-status-failed/10 border border-pier-status-failed/20"
        >
          <p className="text-sm text-pier-fg m-0">
            Cluster unreachable. Try again.
          </p>
        </div>
      )}

      {errors.host && ingressDomain === null && (
        <div
          role="alert"
          className="p-3 rounded-pier bg-pier-status-failed/10 border border-pier-status-failed/20"
        >
          <p className="text-sm text-pier-fg m-0">{errors.host}</p>
        </div>
      )}

      {errors.env && typeof errors.env === "object" && errors.env[""] && (
        <div
          role="alert"
          className="p-3 rounded-pier bg-pier-status-failed/10 border border-pier-status-failed/20"
        >
          <p className="text-sm text-pier-fg m-0">{errors.env[""]}</p>
        </div>
      )}

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
          onChange={(e) => handleNameChange(e.target.value)}
          onBlur={() => setTouched(true)}
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
          onChange={(e) => {
            setImage(e.target.value);
            if (errors.image) {
              setErrors((prev) => ({ ...prev, image: undefined }));
            }
          }}
          onBlur={() => setTouched(true)}
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
          onChange={(e) => {
            setPort(e.target.value);
            if (errors.port) {
              setErrors((prev) => ({ ...prev, port: undefined }));
            }
          }}
          onBlur={() => setTouched(true)}
          placeholder="80"
          invalid={touched && Boolean(errors.port)}
        />
      </Field>

      {/* Replicas */}
      <Field
        id="deploy-replicas"
        label="Replicas"
        hint="0–10"
        error={touched ? errors.replicas : undefined}
      >
        <Input
          id="deploy-replicas"
          type="number"
          value={replicas}
          onChange={(e) => {
            setReplicas(e.target.value);
            if (errors.replicas) {
              setErrors((prev) => ({ ...prev, replicas: undefined }));
            }
          }}
          onBlur={() => setTouched(true)}
          placeholder="1"
          invalid={touched && Boolean(errors.replicas)}
        />
      </Field>

      {/* Public URL */}
      {ingressDomain ? (
        <>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="deploy-public-url"
              checked={publicUrl}
              onChange={(e) => handlePublicUrlChange(e.target.checked)}
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
              onSubdomainChange={handleSubdomainChange}
              onClearError={() => setErrors((prev) => ({ ...prev, host: undefined }))}
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
        onRowChange={handleEnvRowChange}
        onRowRemove={handleEnvRowRemove}
        onRowAdd={handleEnvRowAdd}
        onClearRowError={(id) =>
          setErrors((prev) => {
            if (!prev.env) return prev;
            const newEnv = { ...prev.env };
            delete newEnv[id];
            return { ...prev, env: Object.keys(newEnv).length > 0 ? newEnv : undefined };
          })
        }
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

