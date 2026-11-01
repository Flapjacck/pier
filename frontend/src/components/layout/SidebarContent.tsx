import { Link } from "react-router-dom";
import { cn } from "../../lib/cn";
import type { ClusterHealthState } from "../../lib/clusterHealth";
import { PierLogo } from "../brand/PierLogo";
import { IconChevronLeft, IconChevronRight } from "../icons/InlineIcons";
import { Button } from "../ui/Button";
import { SidebarFooter } from "./SidebarFooter";
import { SidebarNav } from "./SidebarNav";

interface Props {
  collapsed: boolean;
  clusterState: ClusterHealthState;
  onNavigate?: () => void;
  showCollapseToggle?: boolean;
  onToggleCollapse?: () => void;
  collapseControlsId?: string;
}

export function SidebarContent({
  collapsed,
  clusterState,
  onNavigate,
  showCollapseToggle,
  onToggleCollapse,
  collapseControlsId,
}: Props) {
  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 border-b border-pier-border shrink-0",
          collapsed ? "justify-center px-2 py-4" : "px-4 py-4",
        )}
      >
        <Link
          to="/apps"
          className="text-pier-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pier-focus rounded-pier"
          onClick={onNavigate}
          aria-label="Pier home"
        >
          <PierLogo variant={collapsed ? "mark" : "lockup"} height={collapsed ? 28 : 26} />
        </Link>
        {showCollapseToggle && onToggleCollapse && !collapsed && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto shrink-0 hidden md:inline-flex"
            aria-expanded={!collapsed}
            aria-controls={collapseControlsId}
            aria-label="Collapse sidebar"
            onClick={onToggleCollapse}
          >
            <IconChevronLeft />
          </Button>
        )}
      </div>

      {showCollapseToggle && onToggleCollapse && collapsed && (
        <div className="hidden md:flex justify-center py-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-expanded={!collapsed}
            aria-controls={collapseControlsId}
            aria-label="Expand sidebar"
            onClick={onToggleCollapse}
          >
            <IconChevronRight />
          </Button>
        </div>
      )}

      <SidebarNav collapsed={collapsed} onNavigate={onNavigate} />
      <SidebarFooter clusterState={clusterState} collapsed={collapsed} />
    </>
  );
}
