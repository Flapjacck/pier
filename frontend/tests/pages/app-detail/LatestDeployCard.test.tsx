import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LastDeployRow } from "../../../src/pages/app-detail/LastDeployRow";
import { LatestDeployCard } from "../../../src/pages/app-detail/LatestDeployCard";
import { detail, summary } from "../../helpers/deploys";

const { listDeployments, getDeployment } = vi.hoisted(() => ({ listDeployments: vi.fn(), getDeployment: vi.fn() }));
vi.mock("../../../src/api/client", () => ({ listDeployments, getDeployment, deploymentStreamUrl: () => "/stream" }));

describe("latest deploy summaries", () => {
  beforeEach(() => {
    listDeployments.mockReset();
    getDeployment.mockReset();
  });

  it("LatestDeployCard shows the newest deploy's steps", async () => {
    listDeployments.mockResolvedValueOnce({ deployments: [summary({ id: 4 })], nextBefore: null });
    getDeployment.mockResolvedValueOnce(detail({ id: 4 }));
    render(<MemoryRouter><LatestDeployCard app="web" /></MemoryRouter>);
    expect(await screen.findByText("Latest deploy #4")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View deploy" })).toHaveAttribute("href", "/apps/web/deployments/4");
    expect(screen.getByRole("list", { name: "Deploy steps" })).toBeInTheDocument();
    expect(listDeployments).toHaveBeenCalledWith("web", { limit: 1 }, expect.anything());
  });

  it("LatestDeployCard renders nothing without deploys", async () => {
    listDeployments.mockResolvedValueOnce({ deployments: [], nextBefore: null });
    const { container } = render(<MemoryRouter><LatestDeployCard app="web" /></MemoryRouter>);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
    expect(getDeployment).not.toHaveBeenCalled();
  });

  it("LastDeployRow links the newest deploy with its trigger", async () => {
    listDeployments.mockResolvedValueOnce({ deployments: [summary({ id: 9, trigger: "restart" })], nextBefore: null });
    render(<MemoryRouter><dl><LastDeployRow app="web" /></dl></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "#9" })).toHaveAttribute("href", "/apps/web/deployments/9");
    expect(screen.getByText("Last deploy")).toBeInTheDocument();
    expect(screen.getByText(/Restart/)).toBeInTheDocument();
  });
});
