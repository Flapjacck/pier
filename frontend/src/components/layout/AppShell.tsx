import { useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import { PageActionsProvider } from "../../context/PageActionsContext";
import { ShellProvider } from "../../context/ShellContext";
import { useClusterHealth } from "../../hooks/useClusterHealth";
import { useIsMobileLayout } from "../../hooks/useMediaQuery";
import { useSidebarCollapsed } from "../../hooks/useSidebarCollapsed";
import { UnreachablePage } from "../../pages/UnreachablePage";
import { Header } from "./Header";
import { MobileDrawer } from "./MobileDrawer";
import { Sidebar } from "./Sidebar";

const MAIN_ID = "main-content";

export function AppShell() {
  const isMobile = useIsMobileLayout();
  const { collapsed, toggle: toggleCollapsed } = useSidebarCollapsed();
  const { state: clusterState, retry } = useClusterHealth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const shellValue = useMemo(
    () => ({
      collapsed,
      toggleCollapsed,
      mobileOpen,
      setMobileOpen,
      isMobile,
    }),
    [collapsed, toggleCollapsed, mobileOpen, isMobile],
  );

  if (clusterState === "unreachable") {
    return <UnreachablePage onRetry={retry} />;
  }

  return (
    <ShellProvider value={shellValue}>
      <PageActionsProvider>
        <a
          href={`#${MAIN_ID}`}
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-pier focus:bg-pier-bg focus:border focus:border-pier-border"
        >
          Skip to content
        </a>
        <div className="flex min-h-svh bg-pier-bg">
          <Sidebar clusterState={clusterState} shellMainId={MAIN_ID} />
          <MobileDrawer clusterState={clusterState} />
          <div className="flex flex-col flex-1 min-w-0 min-h-svh">
            <Header />
            <main id={MAIN_ID} className="flex-1 overflow-auto p-6">
              <Outlet />
            </main>
          </div>
        </div>
      </PageActionsProvider>
    </ShellProvider>
  );
}
