import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppVolumesCard } from "../../../src/pages/app-detail/AppVolumesCard";

const updateApp = vi.fn();
const createVolume = vi.fn();
const listVolumes = vi.fn();
const setApp = vi.fn();
vi.mock("../../../src/api/client", () => ({ updateApp: (...args: unknown[]) => updateApp(...args), createVolume: (...args: unknown[]) => createVolume(...args), listVolumes: (...args: unknown[]) => listVolumes(...args) }));
vi.mock("../../../src/pages/app-detail/useAppDetail", () => ({ useAppDetail: () => ({ app: { name: "web", replicas: 1, volumes: [{ name: "old", mountPath: "/old" }] }, setApp }) }));
vi.mock("../../../src/components/ui/Toast", () => ({ useToast: () => ({ push: vi.fn() }) }));

describe("AppVolumesCard", () => {
  it("attaches existing and new volumes using the full current list", async () => {
    listVolumes.mockResolvedValue([{ name: "free", size: "1Gi", status: "bound", createdAt: "now" }]);
    updateApp.mockResolvedValue({ name: "web", replicas: 1, volumes: [] });
    createVolume.mockResolvedValue({});
    render(<AppVolumesCard />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "existing" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "free" })).toBeInTheDocument());
    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "free" } });
    fireEvent.click(screen.getByRole("button", { name: "Attach volume" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Attach" }).at(-1)!);
    await waitFor(() => expect(updateApp).toHaveBeenCalledWith("web", { volumes: [{ name: "old", mountPath: "/old" }, { name: "free", mountPath: "/data" }] }));
  });
  it("detaches without the removed volume", async () => {
    listVolumes.mockResolvedValue([]);
    updateApp.mockResolvedValue({ name: "web", replicas: 1, volumes: [] });
    render(<AppVolumesCard />);
    fireEvent.click(screen.getAllByRole("button", { name: "Detach" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Detach" }).at(-1)!);
    await waitFor(() => expect(updateApp).toHaveBeenCalledWith("web", { volumes: [] }));
  });
});
