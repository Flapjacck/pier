import { NavLink } from "react-router-dom";
import { cn } from "../../lib/cn";
import { PierIcon } from "../icons/PierIcon";

const NAV_ITEMS = [
  { to: "/apps", label: "Apps", icon: "app" as const },
] as const;

// Cluster nav slot — enable when multi-cluster or nodes view lands.
// { to: "/cluster", label: "Cluster", icon: "cluster" as const },

const navBase =
  "flex items-center gap-2.5 px-2.5 py-[7px] rounded-pier text-[13.5px] transition-colors";

const navActive =
  "bg-pier-surface-2 text-pier-fg font-semibold shadow-[inset_3px_0_0_var(--pier-water)]";

const navInactive =
  "text-pier-muted font-normal hover:bg-pier-surface-2 hover:text-pier-fg";

interface Props {
  collapsed: boolean;
  onNavigate?: () => void;
}

export function SidebarNav({ collapsed, onNavigate }: Props) {
  return (
    <nav className="flex-1 p-2 flex flex-col gap-0.5" aria-label="Main navigation">
      {!collapsed && (
        <span className="text-[10.5px] font-semibold tracking-widest uppercase text-pier-subtle px-2.5 pt-2 pb-2">
          Overview
        </span>
      )}

      {NAV_ITEMS.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/apps"}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          aria-label={collapsed ? label : undefined}
          className={({ isActive }) =>
            cn(navBase, isActive ? navActive : navInactive, collapsed && "justify-center px-2")
          }
        >
          {({ isActive }) => (
            <>
              <PierIcon name={icon} solid={isActive} size={16} />
              {!collapsed && label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
