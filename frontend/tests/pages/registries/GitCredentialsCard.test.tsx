import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitCredentialsCard } from "../../../src/pages/registries/GitCredentialsCard";

const api = vi.hoisted(() => ({
  listGitCredentials: vi.fn(), createGitCredential: vi.fn(), updateGitCredential: vi.fn(), deleteGitCredential: vi.fn(), push: vi.fn(),
}));
vi.mock("../../../src/api/sources", () => api);
vi.mock("../../../src/components/ui/Toast", () => ({ useToast: () => ({ push: api.push }) }));

const saved = { name: "github", username: "x-access-token", createdAt: "2026-11-01T00:00:00.000Z" };

describe("GitCredentialsCard", () => {
  beforeEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

  it("creates a credential and clears the token field", async () => {
    api.listGitCredentials.mockResolvedValue([]);
    api.createGitCredential.mockResolvedValueOnce(saved);
    render(<GitCredentialsCard />);
    expect(await screen.findByText(/No git credentials saved/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "github" } });
    fireEvent.change(screen.getByLabelText(/^Username/), { target: { value: "x-access-token" } });
    fireEvent.change(screen.getByLabelText(/^Access token/), { target: { value: "ghp_example" } });
    fireEvent.click(screen.getByRole("button", { name: "Save credential" }));
    await waitFor(() => expect(api.createGitCredential).toHaveBeenCalledWith({ name: "github", username: "x-access-token", token: "ghp_example" }));
    expect(screen.getByLabelText(/^Access token/)).toHaveValue("");
  });

  it("edits without resending the token when left blank", async () => {
    api.listGitCredentials.mockResolvedValue([saved]);
    api.updateGitCredential.mockResolvedValueOnce(saved);
    render(<GitCredentialsCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Name")).toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateGitCredential).toHaveBeenCalledWith("github", { username: "x-access-token" }));
  });

  it("removes a credential", async () => {
    api.listGitCredentials.mockResolvedValue([saved]);
    api.deleteGitCredential.mockResolvedValueOnce(undefined);
    render(<GitCredentialsCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(api.deleteGitCredential).toHaveBeenCalledWith("github"));
  });
});
