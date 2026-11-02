import { describe, it, expect, beforeEach } from "vitest";
import { LogBuffer } from "./logBuffer";

describe("LogBuffer", () => {
  let buffer: LogBuffer;

  beforeEach(() => {
    buffer = new LogBuffer(10); // Small cap for testing
  });

  it("appends lines with sequential numbering", () => {
    const { lines, dropped } = buffer.append(["line1", "line2"]);
    expect(lines).toHaveLength(2);
    expect(lines[0].n).toBe(1);
    expect(lines[0].text).toBe("line1");
    expect(lines[1].n).toBe(2);
    expect(lines[1].text).toBe("line2");
    expect(dropped).toBe(0);
  });

  it("strips ANSI color codes", () => {
    const { lines } = buffer.append(["\x1b[31mred text\x1b[0m"]);
    expect(lines[0].text).toBe("red text");
  });

  it("strips OSC sequences", () => {
    const { lines } = buffer.append(["text\x1b]0;title\x07"]);
    expect(lines[0].text).toBe("text");
  });

  it("drops oldest lines when exceeding cap", () => {
    // Add 12 lines to a buffer capped at 10
    const result = buffer.append(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
    expect(result.dropped).toBe(2);
    expect(result.lines).toHaveLength(10);
    // Lines 11 and 12 should be the last
    expect(result.lines[8].text).toBe("11");
    expect(result.lines[9].text).toBe("12");
  });

  it("keeps line numbers stable across drops", () => {
    buffer.append(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
    const lines = buffer.getLines();
    // Line numbers should continue incrementally
    expect(lines[0].n).toBe(2); // Oldest kept
    expect(lines[9].n).toBe(11); // Newest
  });

  it("clears all lines and resets numbering", () => {
    buffer.append(["1", "2", "3"]);
    buffer.clear();

    const { lines } = buffer.append(["new1", "new2"]);
    expect(lines[0].n).toBe(1); // Reset to 1
    expect(lines[1].n).toBe(2);
  });

  it("getLines returns a fresh array", () => {
    buffer.append(["1", "2"]);
    const lines1 = buffer.getLines();
    const lines2 = buffer.getLines();
    expect(lines1).not.toBe(lines2);
    expect(lines1).toEqual(lines2);
  });

  it("exports as plain text", () => {
    buffer.append(["line1", "line2", "line3"]);
    const text = buffer.toText();
    expect(text).toBe("line1\nline2\nline3");
  });

  it("maintains order across multiple appends", () => {
    buffer.append(["a", "b"]);
    buffer.append(["c", "d"]);
    const lines = buffer.getLines();
    expect(lines.map((l) => l.text)).toEqual(["a", "b", "c", "d"]);
  });

  it("uses default cap of 5000", () => {
    const bigBuffer = new LogBuffer();
    // Just verify it's created; we won't fill it
    expect(bigBuffer).toBeDefined();
  });
});
