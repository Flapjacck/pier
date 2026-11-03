import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DeployForm } from "../../../src/pages/deploy/DeployForm";

const push = vi.fn();
vi.mock("../../../src/api/client", () => ({ listVolumes: () => Promise.resolve([]), createApp: vi.fn() }));
vi.mock("../../../src/components/ui/Toast", () => ({ useToast: () => ({ push }) }));

describe("DeployForm volume", () => {
  it("locks replicas to 1 while a volume is added", async () => {
    render(<MemoryRouter><DeployForm ingressDomain={null} onCancel={vi.fn()} /></MemoryRouter>);
    const replicas = screen.getByLabelText(/Replicas/);
    fireEvent.change(replicas, { target: { value: "3" } });
    fireEvent.click(screen.getByText("Add a volume"));
    await waitFor(() => expect(replicas).toBeDisabled());
    expect(replicas).toHaveValue(1);
    expect(screen.getByText("Volume apps run at most 1 replica")).toBeInTheDocument();
  });
});
