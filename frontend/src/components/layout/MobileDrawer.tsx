import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "../../lib/cn";
import type { ClusterHealthState } from "../../lib/clusterHealth";
import { useShell } from "../../context/ShellContext";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { SidebarContent } from "./SidebarContent";

interface Props {
  clusterState: ClusterHealthState;
}

export function MobileDrawer({ clusterState }: Props) {
  const { mobileOpen, setMobileOpen, isMobile } = useShell();
  const panelRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useFocusTrap(panelRef, mobileOpen && isMobile);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, setMobileOpen]);

  useEffect(() => {
    if (!mobileOpen || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen, isMobile]);

  useEffect(() => {
    if (!mobileOpen || !isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, isMobile, setMobileOpen]);

  if (!isMobile) return null;

  return (
    <>
      <button
        type="button"
        aria-hidden={!mobileOpen}
        tabIndex={mobileOpen ? 0 : -1}
        className={cn(
          "fixed inset-0 z-40 bg-black/40 motion-safe:transition-opacity md:hidden",
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={() => setMobileOpen(false)}
        aria-label="Close menu"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-60 flex flex-col bg-pier-surface border-r border-pier-border",
          "md:hidden motion-safe:transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SidebarContent
          collapsed={false}
          clusterState={clusterState}
          onNavigate={() => setMobileOpen(false)}
        />
      </div>
    </>
  );
}
