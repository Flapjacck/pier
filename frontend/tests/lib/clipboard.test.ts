import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "../../src/lib/clipboard";

describe("copyText", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the Clipboard API in a secure context", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("isSecureContext", true);
    await copyText("hello");
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand on plain HTTP and cleans up", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("isSecureContext", false);
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { value: exec, configurable: true });
    await copyText("hello");
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("rejects when the browser blocks the fallback", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("isSecureContext", false);
    Object.defineProperty(document, "execCommand", { value: () => false, configurable: true });
    await expect(copyText("hello")).rejects.toThrow("blocked");
  });
});
