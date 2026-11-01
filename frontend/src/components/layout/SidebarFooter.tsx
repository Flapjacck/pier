import { logout } from "../../lib/auth";
import type { ClusterHealthState } from "../../lib/clusterHealth";
import { IconLogout } from "../icons/InlineIcons";
import { Button } from "../ui/Button";
import { ClusterStatus } from "./ClusterStatus";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  clusterState: ClusterHealthState;
  collapsed: boolean;
}

export function SidebarFooter({ clusterState, collapsed }: Props) {
  return (
    <div className="p-2 border-t border-pier-border flex flex-col gap-0.5">
      <ClusterStatus state={clusterState} compact={collapsed} />
      <ThemeToggle compact={collapsed} />
      <Button
        type="button"
        variant="ghost"
        className={collapsed ? "justify-center w-full px-2" : "justify-start w-full"}
        aria-label="Log out"
        title={collapsed ? "Log out" : undefined}
        onClick={() => void logout()}
      >
        <IconLogout />
        {!collapsed && "Log out"}
      </Button>
    </div>
  );
}
