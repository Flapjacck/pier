import { Link, useSearchParams } from "react-router-dom";
import { PierIcon } from "../components/icons/PierIcon";
import { Button } from "../components/ui/Button";
import { Skeleton } from "../components/ui/Skeleton";
import {
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeaderCell, TableRow,
} from "../components/ui/Table";
import { useAuditLog } from "../hooks/useAuditLog";
import { actionLabel, formatDetails } from "../lib/audit";
import { formatAbsoluteDate, formatRelativeTime } from "../lib/time";
import type { AuditEntry } from "../api/types";

const LINK = "text-pier-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pier-focus rounded-sm";

const COLUMNS = ["When", "Action", "App", "Target", "Details", "By"] as const;

function EntryRow({ entry }: { entry: AuditEntry }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-pier-muted">
        <time dateTime={entry.ts} title={formatAbsoluteDate(entry.ts)}>{formatRelativeTime(entry.ts)}</time>
      </TableCell>
      <TableCell className="whitespace-nowrap font-medium">{actionLabel(entry.action)}</TableCell>
      <TableCell>
        {entry.app ? (
          <Link to={`/apps/${encodeURIComponent(entry.app)}`} className={LINK}>
            {entry.app}
          </Link>
        ) : (
          <span className="text-pier-subtle">—</span>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {entry.app && entry.target && entry.action.startsWith("deploy.") ? (
          <Link to={`/apps/${encodeURIComponent(entry.app)}/deployments/${encodeURIComponent(entry.target)}`} className={LINK}>
            #{entry.target}
          </Link>
        ) : (
          entry.target ?? <span className="text-pier-subtle">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-pier-muted">{formatDetails(entry.details)}</TableCell>
      <TableCell className="whitespace-nowrap text-xs text-pier-muted">
        {entry.actor} · <span className="font-mono">{entry.ip}</span>
      </TableCell>
    </TableRow>
  );
}

/** Audit log: every successful change made through Pier, newest first. ?app= filters to one app. */
export function ActivityPage() {
  const [params] = useSearchParams();
  const app = params.get("app") ?? undefined;
  const { entries, error, loading, loadingMore, hasMore, loadMore, refetch } = useAuditLog(app);

  return (
    <div className="max-w-6xl">
      <header className="mb-6">
        <h1 className="m-0 text-[21px] font-bold text-pier-fg">Activity</h1>
        <p className="mt-1 mb-0 text-sm text-pier-muted">
          {app ? <>Changes to <strong className="text-pier-fg">{app}</strong> · <Link to="/activity" className={LINK}>Show all</Link></> : "Changes made through Pier, newest first"}
        </p>
      </header>

      <div className="border border-pier-border rounded-pier-lg bg-pier-bg p-4 md:p-6">
        <div className="flex justify-end mb-4">
          <Button onClick={refetch} variant="secondary" size="sm" disabled={loading}>
            <PierIcon name="rollback" size={14} />
            Refresh
          </Button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-pier-status-failed-text mb-4">
            {error.kind === "network" || error.kind === "unavailable" ? "Could not reach the backend." : error.message}
          </p>
        )}

        <Table aria-label="Audit log" aria-busy={loading}>
          <TableHead>
            <TableRow>
              {COLUMNS.map((c) => <TableHeaderCell key={c}>{c}</TableHeaderCell>)}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              [0, 1, 2].map((i) => (
                <TableRow key={i}>
                  {COLUMNS.map((c) => <TableCell key={c}><Skeleton className="h-4 w-20" /></TableCell>)}
                </TableRow>
              ))
            ) : entries.length === 0 ? (
              !error && <TableEmpty colSpan={COLUMNS.length}>{app ? `No activity for ${app} yet.` : "No activity yet."}</TableEmpty>
            ) : (
              entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)
            )}
          </TableBody>
        </Table>

        {hasMore && !loading && (
          <div className="flex justify-center mt-4">
            <Button onClick={loadMore} variant="secondary" size="sm" disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
