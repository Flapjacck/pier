import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SidebarNav } from "../../../src/components/layout/SidebarNav";

describe("SidebarNav", () => {
  it("links to Apps and Activity, marking the current page", () => {
    render(<MemoryRouter initialEntries={["/activity"]}><SidebarNav collapsed={false} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Apps" })).toHaveAttribute("href", "/apps");
    const activity = screen.getByRole("link", { name: "Activity" });
    expect(activity).toHaveAttribute("href", "/activity");
    expect(activity).toHaveAttribute("aria-current", "page");
  });
});
