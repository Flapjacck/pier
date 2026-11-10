import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { App, AppSource } from "../../../src/api/types";
import { BuildStateBanner } from "../../../src/pages/app-detail/BuildStateBanner";
import { SourceRows } from "../../../src/pages/app-detail/SourceRows";

const base: App = { name: "web", image: "nginx:1.27", replicas: 1, ready: 1, status: "running", createdAt: "2026-11-01T00:00:00.000Z" };
const source: AppSource = {
  method: "railpack", repo: "https://github.com/owner/repo.git", branch: "main", folder: "apps/api", dockerfile: "Dockerfile",
  lastCommit: "0123456789abcdef", lastImage: "localhost:30500/web:d4", volumeHints: [],
};

function dl(app: App) {
  return render(<MemoryRouter><dl><SourceRows app={app} /></dl><BuildStateBanner app={app} /></MemoryRouter>);
}

describe("SourceRows", () => {
  it("shows only the image for a pre-built image app", () => {
    dl(base);
    expect(screen.getByText("Image")).toBeInTheDocument();
    expect(screen.getByText("nginx:1.27")).toBeInTheDocument();
    expect(screen.queryByText("Repository")).not.toBeInTheDocument();
  });

  it("puts the repo first and the built image second for a git app", () => {
    dl({ ...base, source });
    const terms = screen.getAllByRole("term").map((t) => t.textContent);
    expect(terms).toEqual(["Repository", "Built image"]);
    expect(screen.getByRole("link", { name: source.repo })).toHaveAttribute("href", "https://github.com/owner/repo");
    expect(screen.getByText("0123456")).toBeInTheDocument();
    expect(screen.getByText(source.lastImage!)).toBeInTheDocument();
  });

  it("shows ssh remotes as text, not a link", () => {
    dl({ ...base, source: { ...source, repo: "git@github.com:owner/repo.git" } });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("git@github.com:owner/repo.git")).toBeInTheDocument();
  });
});

describe("BuildStateBanner", () => {
  it("links a failed first build to its build logs", () => {
    dl({ ...base, status: "failed", ready: 0, image: "", source: { ...source, lastImage: null }, deploymentId: 4 });
    expect(screen.getByRole("alert")).toHaveTextContent("The build failed");
    expect(screen.getByRole("link", { name: "View build logs" })).toHaveAttribute("href", "/apps/web/deployments/4");
  });

  it("stays hidden for a running app", () => {
    dl({ ...base, source, deploymentId: 4 });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
