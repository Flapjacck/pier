import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ResourcesFields } from "../../../src/components/apps/ResourcesFields";
import { DEFAULT_RESOURCES, RESOURCE_PRESETS, setResourceField } from "../../../src/lib/resources";

describe("ResourcesFields", () => {
  it("shows the matching preset and its values", () => {
    render(<ResourcesFields idPrefix="t" value={DEFAULT_RESOURCES} onChange={() => {}} />);
    expect(screen.getByLabelText("CPU & memory")).toHaveValue("default");
    expect(screen.getByText(/Reserves 50m CPU \/ 64Mi RAM/)).toBeInTheDocument();
  });

  it("emits a preset's values when picked", () => {
    const onChange = vi.fn();
    render(<ResourcesFields idPrefix="t" value={DEFAULT_RESOURCES} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("CPU & memory"), { target: { value: "large" } });
    expect(onChange).toHaveBeenCalledWith(RESOURCE_PRESETS.find((p) => p.id === "large")?.values);
  });

  it("opens custom inputs for non-preset values and shows errors", () => {
    const value = setResourceField(DEFAULT_RESOURCES, "limits.cpu", "750m");
    render(
      <ResourcesFields
        idPrefix="t"
        value={value}
        onChange={() => {}}
        errors={{ "limits.cpu": "Bad CPU" }}
      />,
    );
    expect(screen.getByLabelText("CPU & memory")).toHaveValue("custom");
    expect(screen.getByLabelText("CPU limit")).toHaveValue("750m");
    expect(screen.getByText("Bad CPU")).toBeInTheDocument();
  });

  it("edits one custom field", () => {
    const onChange = vi.fn();
    render(<ResourcesFields idPrefix="t" value={DEFAULT_RESOURCES} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("CPU & memory"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("Memory limit"), { target: { value: "512Mi" } });
    expect(onChange).toHaveBeenLastCalledWith(setResourceField(DEFAULT_RESOURCES, "limits.memory", "512Mi"));
  });
});
