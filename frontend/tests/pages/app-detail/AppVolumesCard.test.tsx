import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../src/api/errors";
import { AppVolumesCard } from "../../../src/pages/app-detail/AppVolumesCard";

const updateApp = vi.fn();
const createVolume = vi.fn();
const listVolumes = vi.fn();
const setApp = vi.fn();
const push = vi.fn();
vi.mock("../../../src/api/client", () => ({ updateApp: (...args: unknown[]) => updateApp(...args), createVolume: (...args: unknown[]) => createVolume(...args), listVolumes: (...args: unknown[]) => listVolumes(...args) }));
vi.mock("../../../src/pages/app-detail/useAppDetail", () => ({ useAppDetail: () => ({ app: { name: "web", replicas: 1, volumes: [{ name: "old", mountPath: "/old" }] }, setApp }) }));
vi.mock("../../../src/components/ui/Toast", () => ({ useToast: () => ({ push }) }));

const confirmAttach = () => {
  fireEvent.click(screen.getByRole("button", { name: "Attach volume" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Attach" }).at(-1)!);
};

describe("AppVolumesCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateApp.mockResolvedValue({ name: "web", replicas: 1, volumes: [] });
  });

  it("attaches an existing volume using the full current list", async () => {
    listVolumes.mockResolvedValue([{ name: "free", size: "1Gi", status: "bound", createdAt: "now" }]);
    render(<AppVolumesCard />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "existing" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "free" })).toBeInTheDocument());
    confirmAttach();
    await waitFor(() => expect(updateApp).toHaveBeenCalledWith("web", { volumes: [{ name: "old", mountPath: "/old" }, { name: "free", mountPath: "/data" }] }));
  });

  it("creates a new volume through the app update, not a separate create call", async () => {
    listVolumes.mockResolvedValue([]);
    render(<AppVolumesCard />);
    confirmAttach();
    await waitFor(() => expect(updateApp).toHaveBeenCalledWith("web", { volumes: [{ name: "old", mountPath: "/old" }, { name: "web-data", mountPath: "/data", size: "1Gi" }] }));
    expect(createVolume).not.toHaveBeenCalled();
  });

  it("blocks invalid names and mount paths before submitting", async () => {
    listVolumes.mockResolvedValue([]);
    render(<AppVolumesCard />);
    fireEvent.change(screen.getByLabelText("Volume name"), { target: { value: "Bad_Name" } });
    expect(screen.getByRole("button", { name: "Attach volume" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Volume name"), { target: { value: "good" } });
    fireEvent.change(screen.getByLabelText("Mount path"), { target: { value: "/proc/x" } });
    expect(screen.getByText("That path is reserved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attach volume" })).toBeDisabled();
  });

  it("shows the API details in the error toast", async () => {
    listVolumes.mockResolvedValue([]);
    updateApp.mockRejectedValue(new ApiError(422, { ok: false, error: "invalid volumes", details: "volumes require replicas to be 1" }));
    render(<AppVolumesCard />);
    confirmAttach();
    await waitFor(() => expect(push).toHaveBeenCalledWith({ variant: "error", title: "Volume update failed", description: "volumes require replicas to be 1" }));
    expect(setApp).not.toHaveBeenCalled();
  });

  it("detaches without the removed volume", async () => {
    listVolumes.mockResolvedValue([]);
    render(<AppVolumesCard />);
    fireEvent.click(screen.getAllByRole("button", { name: "Detach" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Detach" }).at(-1)!);
    await waitFor(() => expect(updateApp).toHaveBeenCalledWith("web", { volumes: [] }));
  });
});
