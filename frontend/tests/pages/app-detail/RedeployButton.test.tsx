import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RedeployButton } from "../../../src/pages/app-detail/RedeployButton";

const { redeployApp, push } = vi.hoisted(() => ({ redeployApp: vi.fn(), push: vi.fn() }));
vi.mock("../../../src/api/sources", () => ({ redeployApp }));
vi.mock("../../../src/components/ui/Toast", () => ({ useToast: () => ({ push }) }));

function renderButton() {
  return render(
    <MemoryRouter initialEntries={["/apps/web"]}>
      <Routes>
        <Route path="/apps/:name" element={<RedeployButton app="web" />} />
        <Route path="/apps/:name/deployments/:id" element={<p>deploy page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RedeployButton", () => {
  beforeEach(() => { redeployApp.mockReset(); push.mockReset(); });

  it("starts a build and opens its deploy page", async () => {
    redeployApp.mockResolvedValueOnce({ deploymentId: 9 });
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: /Redeploy/ }));
    expect(await screen.findByText("deploy page")).toBeInTheDocument();
    expect(redeployApp).toHaveBeenCalledWith("web");
  });

  it("toasts and re-enables on failure", async () => {
    redeployApp.mockRejectedValueOnce(new Error("A deploy is already running"));
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: /Redeploy/ }));
    expect(await screen.findByRole("button", { name: /Redeploy/ })).toBeEnabled();
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ variant: "error", description: "A deploy is already running" }));
  });
});
