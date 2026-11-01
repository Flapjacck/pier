import { cn } from "../../lib/cn";
import type { ClusterHealthState } from "../../lib/clusterHealth";
import { useShell } from "../../context/ShellContext";
import { SidebarContent } from "./SidebarContent";

interface Props {
  clusterState: ClusterHealthState;
  shellMainId: string;
}

/** Desktop sidebar — hidden on viewports under 768px (drawer replaces it). */
export function Sidebar({ clusterState, shellMainId }: Props) {
  const { collapsed, toggleCollapsed } = useShell();

  return (
    <aside
      id="pier-sidebar"
      className={cn(
        "hidden md:flex shrink-0 flex-col min-h-svh sticky top-0 z-10",
        "bg-pier-surface border-r border-pier-border motion-safe:transition-[width] duration-200",
        collapsed ? "w-14" : "w-60",
      )}
      aria-label="Sidebar"
    >
      <SidebarContent
        collapsed={collapsed}
        clusterState={clusterState}
        showCollapseToggle
        onToggleCollapse={toggleCollapsed}
        collapseControlsId={shellMainId}
      />
    </aside>
  );
}
