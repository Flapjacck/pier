import { useCallback, useMemo, useRef, useState } from "react";
import { updateApp } from "../../api/client";
import { ApiError } from "../../api/errors";
import type { App, AppResources, UpdateAppBody } from "../../api/types";
import { deployStartedText } from "../../lib/deploys";
import { buildUpdateBody, configValuesFromApp, type AppConfigValues } from "../../lib/appConfig";
import type { EnvRowValue } from "../../lib/envValidation";

type ShowToast = (opts: { title: string; description?: string; variant: "success" | "error" }) => void;

/**
 * State for the Settings tab's Configuration card: edit image, port, env and CPU/RAM,
 * then send only the changed fields to PATCH /api/apps/:name.
 */
export function useAppConfigForm(app: App, setApp: (app: App) => void, showToast: ShowToast) {
  const [values, setValues] = useState<AppConfigValues>(() => configValuesFromApp(app));
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmBody, setConfirmBody] = useState<UpdateAppBody | null>(null);
  const nextEnvId = useRef(values.env.length + 1);

  const result = useMemo(() => buildUpdateBody(app, values), [app, values]);
  const errors = touched && !result.ok ? result.errors : {};
  const dirty = !result.ok || result.changed;

  const update = useCallback((patch: Partial<AppConfigValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
  }, []);

  const env = {
    rows: values.env,
    change: (row: EnvRowValue) =>
      update({ env: values.env.map((r) => (r.id === row.id ? row : r)) }),
    remove: (id: string) => update({ env: values.env.filter((r) => r.id !== id) }),
    add: () => update({ env: [...values.env, { id: String(nextEnvId.current++), key: "", value: "" }] }),
  };

  const reset = useCallback((from: App) => {
    const next = configValuesFromApp(from);
    nextEnvId.current = next.env.length + 1;
    setValues(next);
    setTouched(false);
  }, []);

  /** Validate; open the confirm dialog when there's something valid to save. */
  const requestSave = useCallback(() => {
    setTouched(true);
    if (result.ok && result.changed) setConfirmBody(result.body);
  }, [result]);

  const save = useCallback(async () => {
    if (!confirmBody) return;
    setPending(true);
    try {
      const updated = await updateApp(app.name, confirmBody);
      setApp(updated);
      reset(updated);
      showToast({ variant: "success", title: deployStartedText(updated.deploymentId, `Updated ${app.name}`), description: "Pods are rolling out" });
    } catch (err) {
      const error = err instanceof ApiError ? err : ApiError.network(err);
      showToast({
        variant: "error",
        title: error.kind === "forbidden" ? "Not enough quota" : "Update failed",
        description: error.details ?? error.message,
      });
    } finally {
      setPending(false);
      setConfirmBody(null);
    }
  }, [app.name, confirmBody, reset, setApp, showToast]);

  return {
    values,
    setImage: (image: string) => update({ image }),
    setPort: (port: string) => update({ port }),
    setResources: (resources: AppResources) => update({ resources }),
    env,
    errors,
    dirty,
    pending,
    confirmBody,
    closeConfirm: () => setConfirmBody(null),
    requestSave,
    save,
    discard: () => reset(app),
  };
}
