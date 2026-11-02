import { describe, it, expect } from "vitest";
import { safeNext } from "./safeNext";

describe("safeNext", () => {
  it("accepts relative app path", () => {
    expect(safeNext("/apps")).toBe("/apps");
  });

  it("accepts relative path with query string", () => {
    expect(safeNext("/apps/x?tab=logs")).toBe("/apps/x?tab=logs");
  });

  it("rejects double-slash open redirect", () => {
    expect(safeNext("//evil.com")).toBe("/apps");
  });

  it("rejects backslash open redirect", () => {
    expect(safeNext("/\\evil.com")).toBe("/apps");
  });

  it("rejects http protocol", () => {
    expect(safeNext("https://evil.com")).toBe("/apps");
  });

  it("rejects javascript protocol", () => {
    expect(safeNext("javascript:alert(1)")).toBe("/apps");
  });

  it("rejects empty string", () => {
    expect(safeNext("")).toBe("/apps");
  });

  it("rejects null", () => {
    expect(safeNext(null)).toBe("/apps");
  });

  it("rejects undefined", () => {
    expect(safeNext(undefined)).toBe("/apps");
  });

  it("uses custom fallback", () => {
    expect(safeNext("", "/home")).toBe("/home");
    expect(safeNext(null, "/home")).toBe("/home");
  });

  it("accepts paths with fragment", () => {
    expect(safeNext("/apps#section")).toBe("/apps#section");
  });

  it("accepts nested paths", () => {
    expect(safeNext("/apps/myapp/logs")).toBe("/apps/myapp/logs");
  });
});
