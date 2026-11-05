import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DeployForm } from "../../../src/pages/deploy/DeployForm";

const push = vi.fn();
vi.mock("../../../src/api/client", () => ({
  listVolumes: () => Promise.resolve([]),
  createApp: vi.fn(),
  inspectImage: vi.fn(),
}));
vi.mock("../../../src/api/registries", () => ({
  listRegistries: () => Promise.resolve([]),
}));
vi.mock("../../../src/api/gitCredentials", () => ({
  listGitCredentials: () => Promise.resolve([]),
}));
vi.mock("../../../src/api/gitProbe", () => ({
  probeGitRepo: vi.fn(),
}));
vi.mock("../../../src/components/ui/Toast", () => ({ useToast: () => ({ push }) }));

async function goToRuntime() {
  render(
    <MemoryRouter>
      <DeployForm ingressDomain={null} onCancel={vi.fn()} />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText(/App name/i), { target: { value: "demo" } });
  fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
  // Source step — pick image
  fireEvent.click(screen.getByRole("radio", { name: /Container image/i }));
  fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
  // Connect step — image
  fireEvent.change(screen.getByLabelText(/Image/i), { target: { value: "nginx:1.27" } });
  fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
  // Runtime
  await waitFor(() => expect(screen.getByLabelText(/Replicas/i)).toBeInTheDocument());
}

describe("DeployForm volume", () => {
  it("locks replicas to 1 while a volume is added", async () => {
    await goToRuntime();
    const replicas = screen.getByLabelText(/Replicas/i);
    fireEvent.change(replicas, { target: { value: "3" } });
    fireEvent.click(screen.getByText("Add a volume"));
    await waitFor(() => expect(replicas).toBeDisabled());
    expect(replicas).toHaveValue(1);
    expect(screen.getByText("Volume apps run at most 1 replica")).toBeInTheDocument();
  });
});
