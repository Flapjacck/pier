import { NavLink } from "react-router-dom";
import { cn } from "../../lib/cn";
import type { PierTheme } from "../../hooks/usePierTheme";
import { PierLogo } from "../brand/PierLogo";
import { PierIcon } from "../icons/PierIcon";
import { ThemeToggle } from "./ThemeToggle";

const NAV_ITEMS = [
  { to: "/apps",     label: "Apps",     icon: "app",      disabled: false },
  { to: "/nodes",    label: "Nodes",    icon: "cluster",  disabled: true  },
  { to: "/logs",     label: "Logs",     icon: "logs",     disabled: true  },
  { to: "/settings", label: "Settings", icon: "settings", disabled: true  },
] as const;

const navBase =
  "flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13.5px] transition-colors";

const navActive =
  "bg-pier-surface-2 text-pier-fg font-semibold shadow-[inset_3px_0_0_var(--pier-water)]";

const navInactive =
  "text-pier-muted font-normal hover:bg-pier-surface-2 hover:text-pier-fg";

/**
 * Fixed-width left sidebar: Pier P+ier logo, nav links, theme toggle.
 * Disabled nav items (Nodes, Logs, Settings) are dimmed placeholders.
 */
export function Sidebar({ theme, toggle }: PierTheme) {
  return (
    <aside
      className="w-[220px] shrink-0 flex flex-col min-h-svh
                 bg-pier-surface border-r border-pier-border sticky top-0 z-10"
    >
      {/* Logo */}
      <div className="px-4 py-5 border-b border-pier-border">
        <PierLogo theme={theme} height={26} />
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 flex flex-col gap-0.5" aria-label="Main navigation">
        <span className="text-[10.5px] font-semibold tracking-widest uppercase
                         text-pier-subtle px-2.5 pt-2 pb-2">
          Overview
        </span>

        {NAV_ITEMS.map(({ to, label, icon, disabled }) =>
          disabled ? (
            <span
              key={label}
              className={cn(navBase, navInactive, "opacity-40 cursor-default pointer-events-none")}
              aria-disabled="true"
              title="Coming soon"
            >
              <PierIcon name={icon} size={16} />
              {label}
            </span>
          ) : (
            <NavLink
              key={label}
              to={to}
              className={({ isActive }) => cn(navBase, isActive ? navActive : navInactive)}
            >
              <PierIcon name={icon} size={16} />
              {label}
            </NavLink>
          )
        )}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-pier-border">
        <ThemeToggle theme={theme} toggle={toggle} />
      </div>
    </aside>
  );
}
