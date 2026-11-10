import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "../../../src/components/layout/Sidebar";
import { ShellProvider } from "../../../src/context/ShellContext";

// Content needs auth and cluster providers; only the container's layout is under test.
vi.mock("../../../src/components/layout/SidebarContent", () => ({ SidebarContent: () => <nav>nav</nav> }));

const shell = { collapsed: false, toggleCollapsed: () => {}, mobileOpen: false, setMobileOpen: () => {}, isMobile: false };

describe("Sidebar (#83)", () => {
  it("is viewport-high with its own scroll, so it stays put while main scrolls", () => {
    render(<MemoryRouter><ShellProvider value={shell}><Sidebar clusterState="online" shellMainId="main" /></ShellProvider></MemoryRouter>);
    const aside = screen.getByLabelText("Sidebar");
    expect(aside).toHaveClass("h-svh", "overflow-y-auto");
    expect(aside).not.toHaveClass("min-h-svh");
  });
});
