import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VolumeFields } from "../../../src/pages/deploy/VolumeFields";

describe("VolumeFields", () => {
  it("defaults a new volume name to app-data", () => {
    const onChange = vi.fn();
    render(<VolumeFields appName="web" volume={undefined} mode="new" available={[]} loading={false} onModeChange={vi.fn()} onChange={onChange} onNameChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Add a volume"));
    expect(onChange).toHaveBeenCalledWith({ name: "web-data", mountPath: "/data", size: "1Gi" });
  });
  it("shows only unattached existing volumes and the empty hint", () => {
    const available = [{ name: "free", size: "1Gi", status: "bound" as const, createdAt: "now" }];
    const { rerender } = render(<VolumeFields appName="web" volume={{ name: "free", mountPath: "/data" }} mode="existing" available={available} loading={false} onModeChange={vi.fn()} onChange={vi.fn()} onNameChange={vi.fn()} />);
    expect(screen.getByText("free (1Gi)")).toBeInTheDocument();
    rerender(<VolumeFields appName="web" volume={{ name: "free", mountPath: "/data" }} mode="existing" available={[]} loading={false} onModeChange={vi.fn()} onChange={vi.fn()} onNameChange={vi.fn()} />);
    expect(screen.getByText("No unattached volumes available")).toBeInTheDocument();
  });
});
