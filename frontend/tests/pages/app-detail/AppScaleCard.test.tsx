import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppScaleCard } from "../../../src/pages/app-detail/AppScaleCard";
import { ToastProvider } from "../../../src/components/ui/Toast";

vi.mock("../../../src/api/client", () => ({ scaleApp: vi.fn() }));
vi.mock("../../../src/pages/app-detail/useAppDetail", () => ({ useAppDetail: () => ({ app: { name: "web", replicas: 1, volumes: [{ name: "data", mountPath: "/data" }] }, setApp: vi.fn() }) }));

describe("AppScaleCard", () => {
  it("caps volume apps at one replica", () => {
    render(<ToastProvider><AppScaleCard /></ToastProvider>);
    expect(screen.getByLabelText("Replicas")).toHaveAttribute("max", "1");
    expect(screen.getByText("Volume apps run at most 1 replica")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Replicas"), { target: { value: "2" } });
    expect(screen.getByText("Must be 0–1")).toBeInTheDocument();
  });
});
