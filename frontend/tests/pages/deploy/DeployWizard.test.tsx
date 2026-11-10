import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeployWizard } from "../../../src/pages/deploy/DeployWizard";

const api = vi.hoisted(() => ({
  createApp: vi.fn(),
  probeGitRepo: vi.fn(),
  inspectImage: vi.fn(),
}));
vi.mock("../../../src/api/client", () => ({ listVolumes: () => Promise.resolve([]), createApp: api.createApp }));
vi.mock("../../../src/api/registries", () => ({ listRegistries: () => Promise.resolve([]), inspectImage: api.inspectImage }));
vi.mock("../../../src/api/sources", () => ({ listGitCredentials: () => Promise.resolve([]), probeGitRepo: api.probeGitRepo }));
// The success screen needs the theme provider; it isn't what these tests cover.
vi.mock("../../../src/pages/deploy/DeploySuccess", () => ({ DeploySuccess: ({ appName }: { appName: string }) => <p>{appName} deployed</p> }));
vi.mock("../../../src/components/ui/Toast", () => ({ useToast: () => ({ push: vi.fn() }) }));

const probe = { defaultBranch: "main", branches: ["main", "dev"], folders: [".", "api"], dockerfiles: ["api/Dockerfile"], volumeHints: [] };
const sqliteHint = { path: "/app/data", reason: "better-sqlite3 in package.json", source: "dependency", confidence: "medium" };

function renderWizard() {
  render(<MemoryRouter><DeployWizard ingressDomain="192.0.2.10.nip.io" onCancel={vi.fn()} /></MemoryRouter>);
}
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const step = (name: string) => screen.getByRole("region", { name });

beforeEach(() => {
  vi.clearAllMocks();
  api.createApp.mockResolvedValue({ name: "demo", image: "", replicas: 1, ready: 0, status: "building", createdAt: "x", deploymentId: 1 });
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
});

describe("DeployWizard (#83)", () => {
  it("walks the image path with Next and creates only from Review's Deploy", async () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText(/App name/), { target: { value: "demo" } });
    next();
    expect(screen.getByLabelText(/Git repository/)).toBeChecked();
    fireEvent.click(screen.getByLabelText(/Pre-built image/));
    next();
    fireEvent.change(screen.getByLabelText(/^Image/), { target: { value: "nginx:1.27" } });
    next();
    expect(step("Runtime")).toBeInTheDocument();
    next();
    expect(step("Review")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    // Deploy is a plain button; nothing has been created by any Next click.
    expect(screen.getByRole("button", { name: "Deploy" })).toHaveAttribute("type", "button");
    expect(api.createApp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
    await waitFor(() => expect(api.createApp).toHaveBeenCalledTimes(1));
    expect(api.createApp.mock.calls[0][0]).toMatchObject({ name: "demo", image: "nginx:1.27", port: 80, host: "demo.192.0.2.10.nip.io" });
  });

  it("blocks Next on a step with errors and never submits on Enter", () => {
    renderWizard();
    next();
    expect(step("App")).toBeInTheDocument();
    expect(screen.getByText("Name is required")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/App name/), { target: { value: "demo" } });
    fireEvent.submit(screen.getByLabelText(/App name/).closest("form")!);
    expect(step("Source")).toBeInTheDocument();
    expect(api.createApp).not.toHaveBeenCalled();
  });

  it("builds from a repo with Railpack by default, and Add volume only pre-fills the row", async () => {
    api.probeGitRepo.mockImplementation(async (body: { folder?: string }) => (body.folder ? { ...probe, volumeHints: [sqliteHint] } : probe));
    renderWizard();
    fireEvent.change(screen.getByLabelText(/App name/), { target: { value: "demo" } });
    next();
    next(); // Git repository is the default source
    fireEvent.change(screen.getByLabelText(/Repository/), { target: { value: "https://github.com/example/app" } });
    next();
    expect(screen.getByText(/Load the repository first/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load repository" }));
    await screen.findByLabelText(/Branch/);
    next();
    expect(screen.getByLabelText(/Railpack/)).toBeChecked();
    next();
    await screen.findByText("Suggested volumes");
    expect(screen.getByText("better-sqlite3 in package.json")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add volume" }));
    expect(screen.getByLabelText(/Mount path/)).toHaveValue("/app/data");
    expect(screen.queryByText("Suggested volumes")).toBeNull();
    expect(api.createApp).not.toHaveBeenCalled();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
    await waitFor(() => expect(api.createApp).toHaveBeenCalledTimes(1));
    const body = api.createApp.mock.calls[0][0];
    expect(body.image).toBeUndefined();
    expect(body.source).toEqual({ method: "railpack", repo: "https://github.com/example/app", branch: "main", folder: "." });
    expect(body.volumes).toEqual([{ name: "demo-data", mountPath: "/app/data", size: "1Gi" }]);
    expect(body.env).toEqual({ PORT: "8080" });
    expect(api.probeGitRepo).toHaveBeenLastCalledWith(expect.objectContaining({ folder: ".", method: "railpack", branch: "main" }), expect.anything());
  });

  it("shows no suggestions for a repo with no data signals (e.g. a static site)", async () => {
    api.probeGitRepo.mockResolvedValue(probe);
    renderWizard();
    fireEvent.change(screen.getByLabelText(/App name/), { target: { value: "site" } });
    next();
    next();
    fireEvent.change(screen.getByLabelText(/Repository/), { target: { value: "https://github.com/example/site" } });
    fireEvent.click(screen.getByRole("button", { name: "Load repository" }));
    await screen.findByLabelText(/Branch/);
    next();
    next();
    await waitFor(() => expect(api.probeGitRepo).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Suggested volumes")).toBeNull();
  });

  it("lists Dockerfiles relative to the chosen folder", async () => {
    api.probeGitRepo.mockResolvedValue(probe);
    renderWizard();
    fireEvent.change(screen.getByLabelText(/App name/), { target: { value: "demo" } });
    next();
    next();
    fireEvent.change(screen.getByLabelText(/Repository/), { target: { value: "https://github.com/example/app" } });
    fireEvent.click(screen.getByRole("button", { name: "Load repository" }));
    await screen.findByLabelText(/Branch/);
    next();
    fireEvent.click(screen.getByLabelText(/^Dockerfile/));
    fireEvent.change(screen.getByLabelText(/Folder/), { target: { value: "api" } });
    expect(screen.getByRole("combobox", { name: /^Dockerfile/ })).toHaveValue("Dockerfile");
  });
});
