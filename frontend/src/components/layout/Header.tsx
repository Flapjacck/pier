import { useShell } from "../../context/ShellContext";
import { usePageActionsSlot } from "../../context/PageActionsContext";
import { IconMenu } from "../icons/InlineIcons";
import { Button } from "../ui/Button";
import { HeaderBreadcrumb } from "./HeaderBreadcrumb";

export function Header() {
  const { setMobileOpen, isMobile, mobileOpen } = useShell();
  const actions = usePageActionsSlot();

  return (
    <header
      className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-pier-border bg-pier-bg sticky top-0 z-20"
    >
      {isMobile && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open navigation menu"
          aria-controls="pier-sidebar"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <IconMenu />
        </Button>
      )}
      <HeaderBreadcrumb />
      <div className="ml-auto flex items-center gap-2 shrink-0">{actions}</div>
    </header>
  );
}
