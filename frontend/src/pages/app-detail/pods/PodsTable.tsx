import type { AppPod } from "../../../api/types";
import { formatRelativeTime } from "../../../lib/time";
import { Button } from "../../../components/ui/Button";
import { PierIcon } from "../../../components/icons/PierIcon";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../components/ui/Table";

type Props = {
  pods: AppPod[];
  pendingPod?: string;
  onRestart: (pod: AppPod) => void;
  onPreviousLogs: (pod: AppPod) => void;
};

export function PodsTable({ pods, pendingPod, onRestart, onPreviousLogs }: Props) {
  return <Table>
    <TableHead><TableRow>
      {["Name", "Phase", "Ready", "Restarts", "Node", "Age", "Last exit", "Actions"].map((heading) => <TableHeaderCell key={heading}>{heading}</TableHeaderCell>)}
    </TableRow></TableHead>
    <TableBody>{pods.map((pod) => {
      const hasPrevious = pod.restarts > 0 || Boolean(pod.lastTerminationReason);
      return <TableRow key={pod.name}>
        <TableCell><code className="block max-w-[18rem] truncate text-[12.5px]" title={pod.name}>{pod.name}</code>{pod.image && <span className="block max-w-[18rem] truncate font-mono text-xs text-pier-muted" title={pod.image}>{pod.image}</span>}</TableCell>
        <TableCell>{pod.phase}</TableCell>
        <TableCell>{pod.readyContainers}</TableCell>
        <TableCell>{pod.restarts}</TableCell>
        <TableCell>{pod.node ?? "—"}</TableCell>
        <TableCell>{pod.startedAt ? formatRelativeTime(pod.startedAt) : "—"}</TableCell>
        <TableCell>{pod.lastExitCode !== undefined || pod.lastTerminationReason ? `${pod.lastExitCode ?? "—"} · ${pod.lastTerminationReason ?? "—"}` : "—"}</TableCell>
        <TableCell><div className="flex gap-2">
          {hasPrevious && <Button size="sm" variant="ghost" onClick={() => onPreviousLogs(pod)}>Previous logs</Button>}
          <Button size="sm" variant="secondary" disabled={pendingPod === pod.name} onClick={() => onRestart(pod)}><PierIcon name="rollback" size={14} />Restart</Button>
        </div></TableCell>
      </TableRow>;
    })}</TableBody>
  </Table>;
}
