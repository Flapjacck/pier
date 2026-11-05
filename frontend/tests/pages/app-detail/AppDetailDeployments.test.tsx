import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../src/api/errors";
import { AppDetailDeployment } from "../../../src/pages/app-detail/AppDetailDeployment";
import { AppDetailDeployments } from "../../../src/pages/app-detail/AppDetailDeployments";
import { detail, step, summary } from "../../helpers/deploys";

const { listDeployments, getDeployment } = vi.hoisted(() => ({ listDeployments: vi.fn(), getDeployment: vi.fn() }));
vi.mock("../../../src/api/client", () => ({
  listDeployments,
  getDeployment,
  deploymentStreamUrl: () => "/stream",
}));
vi.mock("../../../src/pages/app-detail/useAppDetail", () => ({ useAppDetail: () => ({ app: { name: "web" } }) }));

function renderDetail(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/apps/:name/deployments/:id" element={<AppDetailDeployment />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppDetailDeployments", () => {
  beforeEach(() => {
    listDeployments.mockReset();
    getDeployment.mockReset();
  });

  it("lists deploys and loads older pages", async () => {
    listDeployments.mockResolvedValueOnce({ deployments: [summary({ id: 2 })], nextBefore: 2 });
    render(<MemoryRouter><AppDetailDeployments /></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "#2" })).toBeInTheDocument();
    listDeployments.mockResolvedValueOnce({ deployments: [summary({ id: 1 })], nextBefore: null });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("link", { name: "#1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("shows a backend error", async () => {
    listDeployments.mockRejectedValueOnce(ApiError.network(new Error("down")));
    render(<MemoryRouter><AppDetailDeployments /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the backend.");
  });
});

describe("AppDetailDeployment", () => {
  beforeEach(() => getDeployment.mockReset());

  it("shows the header, failure banner and failed step", async () => {
    const d = detail({ id: 7, status: "failed", reason: "The container keeps crashing (exit code 1)" });
    d.steps[4] = step({ name: "start", label: "Start container", status: "failed" });
    getDeployment.mockResolvedValueOnce(d);
    renderDetail("/apps/web/deployments/7");
    expect(await screen.findByRole("heading", { name: "Deploy #7" })).toBeInTheDocument();
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("Deploy failed: The container keeps crashing");
    expect(screen.getByRole("link", { name: "← All deployments" })).toHaveAttribute("href", "/apps/web/deployments");
    expect(getDeployment).toHaveBeenCalledWith("web", 7, expect.anything());
  });

  it("says not found for a bad id or a 404", async () => {
    renderDetail("/apps/web/deployments/abc");
    expect(screen.getByText("Deployment not found.")).toBeInTheDocument();
    expect(getDeployment).not.toHaveBeenCalled();
  });

  it("says not found when the backend returns 404", async () => {
    getDeployment.mockRejectedValueOnce(new ApiError(404, { ok: false, error: "deployment not found" }));
    renderDetail("/apps/web/deployments/9");
    expect(await screen.findByText("Deployment not found.")).toBeInTheDocument();
  });
});
