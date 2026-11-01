import { useMemo, useState } from "react";
import type { AppPod } from "../../api/types";
import type { LogLine, LogStreamStatus } from "../../hooks/useLogStream";
import { LogsHeader } from "../logs/LogsHeader";
import { LogsActionsMenu } from "../logs/LogsActionsMenu";
import { LogsPanel } from "../logs/LogsPanel";

interface LogsCardProps {
  appName: string;
  pods: AppPod[];
  selectedPod: string;
  onSelectPod: (pod: string) => void;
  selectedTail: number;
  onSelectTail: (tail: number) => void;
  follow: boolean;
  onToggleFollow: (on: boolean) => void;
  lines: LogLine[];
  status: LogStreamStatus;
  droppedCount: number;
  reconnectNow: () => void;
}

/**
 * Complete log viewer card composing header, actions menu, and panel.
 */
export function LogsCard({
  appName,
  pods,
  selectedPod,
  onSelectPod,
  selectedTail,
  onSelectTail,
  follow,
  onToggleFollow,
  lines,
  status,
  droppedCount,
  reconnectNow,
}: LogsCardProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Filter lines by search term (case-insensitive)
  const filteredLines = useMemo(() => {
    if (!search) return lines;
    const lower = search.toLowerCase();
    return lines.filter((line) => line.text.toLowerCase().includes(lower));
  }, [lines, search]);

  return (
    <div className="rounded-pier-lg border border-pier-border overflow-hidden flex flex-col h-full">
      <LogsHeader
        status={status}
        droppedCount={droppedCount}
        selectedPod={selectedPod}
        pods={pods}
        onSelectPod={onSelectPod}
        selectedTail={selectedTail}
        onSelectTail={onSelectTail}
        follow={follow}
        onToggleFollow={onToggleFollow}
        search={search}
        onSearchChange={setSearch}
        filteredLineCount={filteredLines.length}
        totalLineCount={lines.length}
        onReconnect={reconnectNow}
        onOpenMenu={() => setMenuOpen(!menuOpen)}
      />

      <LogsPanel
        lines={lines}
        filteredLines={filteredLines}
        status={status}
        selectedPod={selectedPod}
        autoScroll={autoScroll}
        onAutoScrollChange={setAutoScroll}
      />

      {menuOpen && (
        <LogsActionsMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          lines={lines}
          appName={appName}
          selectedPod={selectedPod}
        />
      )}
    </div>
  );
}
