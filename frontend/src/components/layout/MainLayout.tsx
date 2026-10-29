import type { ReactNode } from "react";
import type { PierTheme } from "../../hooks/usePierTheme";
import { Sidebar } from "./Sidebar";

interface Props extends PierTheme {
  children: ReactNode;
}

/**
 * Top-level shell: sidebar on the left + patterned content area on the right.
 *
 * The content area uses the slats pattern (boardwalk planks) as a background
 * texture. Individual pages wrap their content in a solid card so the pattern
 * shows only in the padding "gutter" around the card — a depth layer that reads
 * naturally: pattern → surface (sidebar) → card (content).
 */
export function MainLayout({ theme, toggle, children }: Props) {
  const pattern =
    theme === "dark"
      ? "/patterns/pattern-slats-dark.svg"
      : "/patterns/pattern-slats-light.svg";

  return (
    <div className="flex min-h-svh bg-pier-bg">
      <Sidebar theme={theme} toggle={toggle} />

      {/* Patterned gutter wraps the content card */}
      <div
        className="flex-1 overflow-auto p-6"
        style={{
          backgroundImage: `url(${pattern})`,
          backgroundRepeat: "repeat",
          backgroundSize: "auto",
          backgroundColor: "var(--pier-surface-2)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
