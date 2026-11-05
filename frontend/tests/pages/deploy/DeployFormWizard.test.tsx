import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DeployForm } from "../../../src/pages/deploy/DeployForm";

const createApp = vi.fn();
vi.mock("../../../src/api/client", () => ({
  listVolumes: () => Promise.resolve([]),
  createApp: (...args: unknown[]) => createApp(...args),
  inspectImage: vi.fn(),
}));
vi.mock("../../../src/api/registries", () => ({ listRegistries: () => Promise.resolve([]) }));
vi.mock("../../../src/api/gitCredentials", () => ({ listGitCredentials: () => Promise.resolve([]) }));
vi.mock("../../../src/api/gitProbe", () => ({
  probeGitRepo: () =>
    Promise.resolve({ defaultBranch: "main", branches: ["main"], folders: ["."] }),
}));
vi.mock("../../../src/components/ui/Toast", () => ({ useToast: () => ({ push: vi.fn() }) }));

async function reachReviewViaGit() {
  render(
    <MemoryRouter>
      <DeployForm ingressDomain="example.com" onCancel={vi.fn()} />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText(/App name/i), { target: { value: "demo" } });
  fireEvent.click(screen.getByLabelText(/Public URL/i));
  fireEvent.change(screen.getByPlaceholderText("demo"), { target: { value: "demo" } });
  fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
  // Source defaults to git
  fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
  fireEvent.change(screen.getByLabelText(/Git repository/i), {
    target: { value: "https://github.com/org/app" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Load repository/i }));
  await waitFor(() => expect(screen.getByRole("button", { name: /^Next$/i })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
  // Build
  fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
  // Runtime
  fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
  await waitFor(() => expect(screen.getByRole("button", { name: /^Deploy$/i })).toBeInTheDocument());
}

describe("DeployForm wizard", () => {
  it("labels steps as N. Label and does not submit when advancing to Review", async () => {
    await reachReviewViaGit();
    expect(screen.getByText("1.")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(createApp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Deploy$/i }));
    await waitFor(() => expect(createApp).toHaveBeenCalledTimes(1));
  });
});
