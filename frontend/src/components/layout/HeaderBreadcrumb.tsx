import { Link, useNavigate, useParams } from "react-router-dom";
import { useApps } from "../../hooks/useApps";
import { cn } from "../../lib/cn";
import { IconChevronDown } from "../icons/InlineIcons";
import { Menu, type MenuOption } from "../ui/Menu";
import { Button } from "../ui/Button";

const crumb =
  "text-[13px] text-pier-muted hover:text-pier-fg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pier-focus rounded-pier";

/**
 * Breadcrumb navigation: Pier / Apps / <app>.
 * App segment is a dropdown menu (Menu) listing all real apps from useApps.
 * Loading state shows crumb without switcher.
 * Error state shows crumb without switcher.
 */
export function HeaderBreadcrumb() {
  const { name } = useParams<{ name?: string }>();
  const navigate = useNavigate();
  const { apps, loading } = useApps();

  // Sort app names for consistent order
  const sortedApps = [...apps].sort((a, b) => a.name.localeCompare(b.name));

  const appOptions: MenuOption[] = sortedApps.map((a) => ({
    id: a.name,
    label: a.name,
  }));

  const onAppSelect = (id: string) => {
    navigate(`/apps/${encodeURIComponent(id)}`);
  };

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 min-w-0">
      <Link to="/apps" className={cn(crumb, "font-medium text-pier-accent")}>
        Pier
      </Link>
      <span className="text-pier-subtle text-[13px]" aria-hidden>
        /
      </span>
      <Link to="/apps" className={cn(crumb, name ? "" : "text-pier-fg font-semibold")}>
        Apps
      </Link>
      {name && (
        <>
          <span className="text-pier-subtle text-[13px]" aria-hidden>
            /
          </span>
          {loading || appOptions.length === 0 ? (
            /* Loading or error: show crumb without switcher */
            <span className="text-[13px] font-semibold text-pier-fg truncate max-w-[12rem]">
              {name}
            </span>
          ) : (
            /* Show menu switcher */
            <Menu
              options={appOptions}
              selectedId={name}
              onSelect={onAppSelect}
              trigger={(props) => (
                <Button
                  type="button"
                  variant="ghost"
                  ref={props.ref}
                  onClick={props.onClick}
                  onKeyDown={props.onKeyDown}
                  aria-expanded={props["aria-expanded"]}
                  aria-controls={props["aria-controls"]}
                  aria-haspopup={props["aria-haspopup"]}
                  className="gap-1 px-2 py-1 h-auto text-[13px] font-semibold text-pier-fg"
                >
                  <span className="truncate max-w-[12rem]">{name}</span>
                  <IconChevronDown />
                </Button>
              )}
            />
          )}
        </>
      )}
    </nav>
  );
}
