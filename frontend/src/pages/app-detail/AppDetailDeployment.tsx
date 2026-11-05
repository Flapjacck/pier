import { Link, useParams } from "react-router-dom";
import type { DeployDetail } from "../../api/types";
import { DeploySteps } from "../../components/deploys/DeploySteps";
import { DeployStatusBadge } from "../../components/deploys/DeployStatusBadge";
import { Skeleton } from "../../components/ui/Skeleton";
import { useDeployment } from "../../hooks/useDeployment";
import { formatDuration, triggerLabel } from "../../lib/deploys";
import { formatAbsoluteDate, formatRelativeTime } from "../../lib/time";
import { useAppDetail } from "./useAppDetail";

const LINK = "text-pier-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pier-focus rounded-sm";

function parseId(raw: string | undefined): number | undefined {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return undefined;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : undefined;
}

function ReasonBanner({ deployment }: { deployment: DeployDetail }) {
  if (!deployment.reason || deployment.status === "running" || deployment.status === "succeeded") return null;
  const failed = deployment.status === "failed";
  return (
    <div
      role={failed ? "alert" : "status"}
      className={failed
        ? "mb-4 rounded-pier border border-pier-status-failed-icon bg-pier-status-failed-bg p-3 text-sm text-pier-status-failed"
        : "mb-4 rounded-pier border border-pier-border bg-pier-surface p-3 text-sm text-pier-muted"}
    >
      <strong>{failed ? "Deploy failed: " : "Deploy cancelled: "}</strong>
      {deployment.reason}
    </div>
  );
}

function Header({ deployment }: { deployment: DeployDetail }) {
  return (
    <div className="mb-4">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h2 className="m-0 text-base font-semibold text-pier-fg">Deploy #{deployment.id}</h2>
        <DeployStatusBadge status={deployment.status} />
      </div>
      <p className="m-0 text-xs text-pier-muted">
        {triggerLabel(deployment.trigger)} ·{" "}
        <time dateTime={deployment.startedAt} title={formatAbsoluteDate(deployment.startedAt)}>
          {formatRelativeTime(deployment.startedAt)}
        </time>
        {deployment.durationMs !== null && <> · {formatDuration(deployment.durationMs)}</>}
        {deployment.spec.image && <> · <span className="font-mono">{deployment.spec.image}</span></>}
      </p>
    </div>
  );
}

/** One deploy: header, reason banner and live steps. */
export function AppDetailDeployment() {
  const { app } = useAppDetail();
  const params = useParams<{ id: string }>();
  const id = parseId(params.id);
  const { deployment, error, loading } = useDeployment(app.name, id);
  const back = (
    <Link to={`/apps/${encodeURIComponent(app.name)}/deployments`} className={`${LINK} mb-4 inline-block text-sm`}>
      ← All deployments
    </Link>
  );

  if (id === undefined || error?.kind === "not_found") {
    return (
      <div>
        {back}
        <p className="m-0 text-sm text-pier-muted">Deployment not found.</p>
      </div>
    );
  }

  return (
    <div>
      {back}
      {loading && !deployment && (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {error && (
        <p role="alert" className="mb-4 text-sm text-pier-status-failed">
          {error.kind === "network" || error.kind === "unavailable" ? "Could not reach the backend." : error.message}
        </p>
      )}
      {deployment && (
        <>
          <Header deployment={deployment} />
          <ReasonBanner deployment={deployment} />
          <DeploySteps deployment={deployment} />
        </>
      )}
    </div>
  );
}
