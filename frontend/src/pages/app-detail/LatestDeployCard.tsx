import { useCallback } from "react";
import { Link } from "react-router-dom";
import { listDeployments } from "../../api/client";
import { DeploySteps } from "../../components/deploys/DeploySteps";
import { DeployStatusBadge } from "../../components/deploys/DeployStatusBadge";
import { useApi } from "../../hooks/useApi";
import { useDeployment } from "../../hooks/useDeployment";
import { triggerLabel } from "../../lib/deploys";
import { formatRelativeTime } from "../../lib/time";

const LINK = "text-pier-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pier-focus rounded-sm";

/** Logs tab: the newest deploy's steps (live while running). Renders nothing without deploys. */
export function LatestDeployCard({ app }: { app: string }) {
  const fetcher = useCallback((signal: AbortSignal) => listDeployments(app, { limit: 1 }, { signal }), [app]);
  const { data } = useApi(fetcher, [app]);
  const latestId = data?.deployments[0]?.id;
  const { deployment } = useDeployment(app, latestId);

  if (!deployment) return null;
  return (
    <section aria-label="Latest deploy" className="mb-4 rounded-pier-lg border border-pier-border bg-pier-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <strong className="text-pier-fg">Latest deploy #{deployment.id}</strong>
          <DeployStatusBadge status={deployment.status} />
          <span className="text-xs text-pier-muted">
            {triggerLabel(deployment.trigger)} · {formatRelativeTime(deployment.startedAt)}
          </span>
        </div>
        <Link to={`/apps/${encodeURIComponent(app)}/deployments/${deployment.id}`} className={`${LINK} text-sm`}>
          View deploy
        </Link>
      </div>
      <DeploySteps deployment={deployment} />
    </section>
  );
}
