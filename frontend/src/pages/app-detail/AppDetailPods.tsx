import { useCallback } from "react";
import { listAppPods } from "../../api/client";
import type { AppPod } from "../../api/types";
import { PierIcon } from "../../components/icons/PierIcon";
import { Button } from "../../components/ui/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../components/ui/Table";
import { useApi } from "../../hooks/useApi";
import { formatRelativeTime } from "../../lib/time";
import { useAppDetail } from "./useAppDetail";

/**
 * Pods tab: list of pods for the app with status, restarts, age, etc.
 * Columns: Name, Phase, Ready, Restarts, Node, Age
 * Reason lines: waiting/termination reasons as secondary lines
 */
export function AppDetailPods() {
  const { app } = useAppDetail();

  const fetcher = useCallback(
    (signal: AbortSignal) => {
      return listAppPods(app.name, { signal });
    },
    [app.name],
  );

  const { data: pods, error, loading, refetch } = useApi(fetcher, [app.name]);

  const columnCount = 6;

  if (loading) {
    return (
      <div>
        <div className="flex gap-2 mb-4">
          <Button onClick={refetch} variant="secondary" size="sm">
            <PierIcon name="rollback" size={14} />
            Refresh
          </Button>
        </div>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Phase</TableHeaderCell>
              <TableHeaderCell>Ready</TableHeaderCell>
              <TableHeaderCell>Restarts</TableHeaderCell>
              <TableHeaderCell>Node</TableHeaderCell>
              <TableHeaderCell>Age</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: columnCount }).map((_, j) => (
                  <TableCell key={j}>
                    <div className="h-5 w-20 rounded-pier bg-pier-surface-2 motion-safe:animate-pulse" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (error) {
    const errorMessage =
      error.kind === "network" || error.kind === "unavailable"
        ? "Could not reach the cluster. Check that the backend is running."
        : error.message;

    return (
      <div>
        <div className="flex gap-2 mb-4">
          <Button onClick={refetch} variant="secondary" size="sm">
            <PierIcon name="rollback" size={14} />
            Refresh
          </Button>
        </div>
        <div className="text-center py-8">
          <p className="text-sm text-pier-muted mb-4">{errorMessage}</p>
          <Button onClick={refetch}>
            <PierIcon name="rollback" size={14} />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <Button onClick={refetch} variant="secondary" size="sm">
          <PierIcon name="rollback" size={14} />
          Refresh
        </Button>
      </div>

      {(!pods || pods.length === 0) ? (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Phase</TableHeaderCell>
              <TableHeaderCell>Ready</TableHeaderCell>
              <TableHeaderCell>Restarts</TableHeaderCell>
              <TableHeaderCell>Node</TableHeaderCell>
              <TableHeaderCell>Age</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableEmpty colSpan={columnCount}>
              No pods (scaled to 0?)
            </TableEmpty>
          </TableBody>
        </Table>
      ) : (
        <PodsTable pods={pods} />
      )}
    </div>
  );
}

interface PodsTableProps {
  pods: AppPod[];
}

function PodsTable({ pods }: PodsTableProps) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Name</TableHeaderCell>
          <TableHeaderCell>Phase</TableHeaderCell>
          <TableHeaderCell>Ready</TableHeaderCell>
          <TableHeaderCell>Restarts</TableHeaderCell>
          <TableHeaderCell>Node</TableHeaderCell>
          <TableHeaderCell>Age</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {pods.map((pod) => (
          <TableRow key={pod.name}>
            <TableCell>
              <code className="font-mono text-[12.5px] text-pier-fg block truncate" title={pod.name}>
                {pod.name}
              </code>
              {pod.waitingReason && (
                <p className="m-0 text-[12px] text-pier-muted mt-1">{pod.waitingReason}</p>
              )}
              {pod.lastTerminationReason && (
                <p className="m-0 text-[12px] text-pier-muted mt-1">{pod.lastTerminationReason}</p>
              )}
            </TableCell>
            <TableCell className="text-[13px]">{pod.phase}</TableCell>
            <TableCell className="text-[13px]">
              {pod.ready ? (
                <span className="text-pier-status-running-text">Ready</span>
              ) : (
                <span className="text-pier-muted">Not ready</span>
              )}
              <span className="text-pier-muted ml-1">({pod.readyContainers})</span>
            </TableCell>
            <TableCell className="text-right">
              {pod.restarts > 0 ? (
                <span className="font-semibold text-pier-status-failed-text">{pod.restarts}</span>
              ) : (
                <span className="text-pier-muted">0</span>
              )}
            </TableCell>
            <TableCell className="text-[13px]">{pod.node || "—"}</TableCell>
            <TableCell className="text-[13px]">
              {pod.startedAt ? (
                <time
                  dateTime={pod.startedAt}
                  className="text-pier-muted"
                >
                  {formatRelativeTime(pod.startedAt)}
                </time>
              ) : (
                "—"
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
