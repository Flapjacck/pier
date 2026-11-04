import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "../../src/api/types";
import { ActivityPage } from "../../src/pages/ActivityPage";

const { listAudit } = vi.hoisted(() => ({ listAudit: vi.fn() }));
vi.mock("../../src/api/client", () => ({ listAudit }));

const recent = new Date(Date.now() - 5 * 60_000).toISOString();
const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  id: 1, ts: recent, actor: "token", ip: "192.0.2.1", action: "app.scale",
  app: "web", target: null, status: 200, details: { replicas: 2 }, ...over,
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/apps/:name" element={<p>app detail page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ActivityPage", () => {
  beforeEach(() => listAudit.mockReset());

  it("lists entries with labels, details, actor and a link to the app", async () => {
    listAudit.mockResolvedValueOnce({
      entries: [
        entry({ id: 2, action: "volume.delete", app: null, target: "data", details: {} }),
        entry({ id: 1 }),
      ],
      nextBefore: null,
    });
    renderAt("/activity");
    const table = await screen.findByRole("table", { name: "Audit log" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Deleted volume")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("data")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Scaled")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("replicas 2")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("5 minutes ago")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("192.0.2.1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    fireEvent.click(within(rows[1]!).getByRole("link", { name: "web" }));
    expect(await screen.findByText("app detail page")).toBeInTheDocument();
  });

  it("loads older entries with Load more", async () => {
    listAudit
      .mockResolvedValueOnce({ entries: [entry({ id: 9 })], nextBefore: 9 })
      .mockResolvedValueOnce({ entries: [entry({ id: 8, action: "app.restart", details: {} })], nextBefore: null });
    renderAt("/activity");
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Restarted")).toBeInTheDocument();
    expect(listAudit).toHaveBeenLastCalledWith({ limit: 50, before: 9, app: undefined }, expect.anything());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument());
  });

  it("filters by ?app= and offers a way back to everything", async () => {
    listAudit.mockResolvedValue({ entries: [], nextBefore: null });
    renderAt("/activity?app=web");
    expect(await screen.findByText("No activity for web yet.")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Audit log" })).toHaveAttribute("aria-busy", "false");
    expect(listAudit).toHaveBeenCalledWith({ limit: 50, app: "web" }, expect.anything());
    expect(screen.getByRole("link", { name: "Show all" })).toHaveAttribute("href", "/activity");
  });

  it("shows an error from the backend", async () => {
    listAudit.mockRejectedValueOnce(new TypeError("offline"));
    renderAt("/activity");
    expect(screen.getByRole("table", { name: "Audit log" })).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the backend.");
    expect(screen.queryByText("No activity yet.")).not.toBeInTheDocument();
  });
});
