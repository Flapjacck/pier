import { useCallback } from "react";
import { Link } from "react-router-dom";
import { listDeployments } from "../../api/client";
import { DeployStatusBadge } from "../../components/deploys/DeployStatusBadge";
import { useApi } from "../../hooks/useApi";
import { triggerLabel } from "../../lib/deploys";
import { formatAbsoluteDate, formatRelativeTime } from "../../lib/time";

const LINK = "text-pier-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pier-focus rounded-sm";

/** Overview row: the newest deploy's id, status, trigger and age. Hidden without deploys. */
export function LastDeployRow({ app }: { app: string }) {
  const fetcher = useCallback((signal: AbortSignal) => listDeployments(app, { limit: 1 }, { signal }), [app]);
  const { data } = useApi(fetcher, [app]);
  const latest = data?.deployments[0];
  if (!latest) return null;
  return (
    <div className="flex gap-4">
      <dt className="text-[13px] font-semibold text-pier-muted w-24 shrink-0">Last deploy</dt>
      <dd className="m-0 flex flex-wrap items-center gap-2 text-[13px]">
        <Link to={`/apps/${encodeURIComponent(app)}/deployments/${latest.id}`} className={`${LINK} font-mono`}>
          #{latest.id}
        </Link>
        <DeployStatusBadge status={latest.status} />
        <span className="text-pier-muted">
          {triggerLabel(latest.trigger)} ·{" "}
          <time dateTime={latest.startedAt} title={formatAbsoluteDate(latest.startedAt)}>
            {formatRelativeTime(latest.startedAt)}
          </time>
        </span>
      </dd>
    </div>
  );
}
