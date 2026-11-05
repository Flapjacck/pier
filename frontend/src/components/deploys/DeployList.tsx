import { Link } from "react-router-dom";
import type { DeploySummary } from "../../api/types";
import { formatDuration, triggerLabel } from "../../lib/deploys";
import { formatAbsoluteDate, formatRelativeTime } from "../../lib/time";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeaderCell, TableRow } from "../ui/Table";
import { DeployStatusBadge } from "./DeployStatusBadge";

const LINK = "text-pier-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pier-focus rounded-sm";
const COLUMNS = ["Deploy", "Trigger", "Status", "Started", "Duration", "Image"] as const;

/** Deploy history rows; each id links to the deploy's steps. */
export function DeployList({ app, deployments }: { app: string; deployments: DeploySummary[] }) {
  return (
    <Table aria-label="Deployments">
      <TableHead>
        <TableRow>
          {COLUMNS.map((c) => <TableHeaderCell key={c}>{c}</TableHeaderCell>)}
        </TableRow>
      </TableHead>
      <TableBody>
        {deployments.length === 0 ? (
          <TableEmpty colSpan={COLUMNS.length}>No deploys yet.</TableEmpty>
        ) : (
          deployments.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-mono">
                <Link to={`/apps/${encodeURIComponent(app)}/deployments/${d.id}`} className={LINK}>#{d.id}</Link>
              </TableCell>
              <TableCell className="whitespace-nowrap">{triggerLabel(d.trigger)}</TableCell>
              <TableCell><DeployStatusBadge status={d.status} /></TableCell>
              <TableCell className="whitespace-nowrap text-pier-muted">
                <time dateTime={d.startedAt} title={formatAbsoluteDate(d.startedAt)}>{formatRelativeTime(d.startedAt)}</time>
              </TableCell>
              <TableCell className="font-mono text-xs text-pier-muted">
                {d.durationMs !== null ? formatDuration(d.durationMs) : "—"}
              </TableCell>
              <TableCell className="max-w-[16rem] truncate font-mono text-xs" title={d.spec.image}>
                {d.spec.image ?? "—"}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
