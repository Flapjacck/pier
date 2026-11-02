import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyDock } from "./EmptyDock";

describe("EmptyDock", () => {
  it("renders title", () => {
    render(<EmptyDock theme="light" />);
    expect(screen.getByText("Nothing docked yet")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(<EmptyDock theme="light" />);
    expect(screen.getByText("Push a repo to deploy your first app.")).toBeInTheDocument();
  });

  it("renders illustration image", () => {
    render(<EmptyDock theme="light" />);
    const img = screen.getByAltText("Empty dock illustration");
    expect(img).toBeInTheDocument();
  });

  it("uses light theme image for light theme", () => {
    render(<EmptyDock theme="light" />);
    const img = screen.getByAltText("Empty dock illustration") as HTMLImageElement;
    expect(img.src).toContain("light");
  });

  it("uses dark theme image for dark theme", () => {
    render(<EmptyDock theme="dark" />);
    const img = screen.getByAltText("Empty dock illustration") as HTMLImageElement;
    expect(img.src).toContain("dark");
  });
});
