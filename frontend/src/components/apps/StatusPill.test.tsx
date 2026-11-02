import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusPill } from "./StatusPill";

describe("StatusPill", () => {
  it("renders running status", () => {
    render(<StatusPill status="running" />);
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("renders building status", () => {
    render(<StatusPill status="building" />);
    expect(screen.getByText("building")).toBeInTheDocument();
  });

  it("renders failed status", () => {
    render(<StatusPill status="failed" />);
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("renders stopped status", () => {
    render(<StatusPill status="stopped" />);
    expect(screen.getByText("stopped")).toBeInTheDocument();
  });
});
