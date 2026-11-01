import { NavLink } from "react-router-dom";
import { cn } from "../../lib/cn";

export interface TabItem {
  to: string;
  label: string;
  end?: boolean;
}

interface Props {
  items: TabItem[];
  className?: string;
  "aria-label"?: string;
}

/** Link-based tabs; active tab gets aria-current="page". */
export function Tabs({ items, className, "aria-label": ariaLabel }: Props) {
  return (
    <nav className={cn("flex gap-1 border-b border-pier-border", className)} aria-label={ariaLabel}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              "px-3 py-2 text-[13px] font-medium -mb-px border-b-2 transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pier-focus",
              isActive
                ? "border-pier-accent text-pier-fg"
                : "border-transparent text-pier-muted hover:text-pier-fg hover:border-pier-border",
            )
          }
          aria-current={undefined}
        >
          {({ isActive }) => (
            <span aria-current={isActive ? "page" : undefined}>{item.label}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
