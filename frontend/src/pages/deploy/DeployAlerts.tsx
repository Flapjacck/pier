import type { SubmitState } from "./useDeployForm";
import type { FieldErrors } from "../../lib/deployValidation";

interface DeployAlertsProps {
  submitState: SubmitState;
  errors: FieldErrors;
  ingressDomain: string | null;
}

/**
 * Form-level and field-specific error alerts.
 */
export function DeployAlerts({ submitState, errors, ingressDomain }: DeployAlertsProps) {
  return (
    <>
      {submitState === "error_unreachable" && (
        <div
          role="alert"
          className="p-3 rounded-pier bg-pier-status-failed/10 border border-pier-status-failed/20"
        >
          <p className="text-sm text-pier-fg m-0">Cluster unreachable. Try again.</p>
        </div>
      )}

      {errors.form && (
        <div
          role="alert"
          className="p-3 rounded-pier bg-pier-status-failed/10 border border-pier-status-failed/20"
        >
          <p className="text-sm text-pier-fg m-0">{errors.form}</p>
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
    </>
  );
}
