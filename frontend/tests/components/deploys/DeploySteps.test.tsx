import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DeployList } from "../../../src/components/deploys/DeployList";
import { DeploySteps } from "../../../src/components/deploys/DeploySteps";
import { detail, step, summary } from "../../helpers/deploys";

describe("DeploySteps", () => {
  it("numbers steps, spins on the running one and opens it", () => {
    const d = detail({}, "pull");
    d.steps[3] = { ...d.steps[3]!, lines: [{ ts: d.startedAt, level: "info", text: "Pulling image nginx:1.27" }] };
    render(<DeploySteps deployment={d} />);
    const list = screen.getByRole("list", { name: "Deploy steps" });
    expect(within(list).getAllByRole("button")).toHaveLength(7);
    expect(screen.getByRole("img", { name: "In progress" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pull image/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Pulling image nginx:1.27")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Validate/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByText("1.2s")).toHaveLength(3);
  });

  it("shows the failed step in red with its reason and error line", () => {
    const d = detail({ status: "failed", reason: "The image nginx:nope could not be pulled" }, "pull");
    d.steps[3] = step({ name: "pull", label: "Pull image", status: "failed", durationMs: 4000, lines: [{ ts: d.startedAt, level: "error", text: "Back-off pulling image" }] });
    render(<DeploySteps deployment={d} />);
    expect(screen.getByRole("alert")).toHaveTextContent("could not be pulled");
    expect(screen.getByText("Back-off pulling image")).toHaveClass("text-pier-status-failed");
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("toggles a step open and closed", () => {
    render(<DeploySteps deployment={detail()} />);
    const button = screen.getByRole("button", { name: /Validate/ });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("No output yet.")).toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});

describe("DeployList", () => {
  it("links each deploy and shows trigger, status, duration and image", () => {
    render(
      <MemoryRouter>
        <DeployList app="web" deployments={[summary({ id: 2, trigger: "patch", status: "failed" }), summary({ id: 1 })]} />
      </MemoryRouter>,
    );
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByRole("link", { name: "#2" })).toHaveAttribute("href", "/apps/web/deployments/2");
    expect(within(rows[0]!).getByText("Settings change")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("failed")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("30.0s")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("nginx:1.27")).toBeInTheDocument();
  });

  it("says when there are no deploys", () => {
    render(<MemoryRouter><DeployList app="web" deployments={[]} /></MemoryRouter>);
    expect(screen.getByText("No deploys yet.")).toBeInTheDocument();
  });
});
