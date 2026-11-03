export function mountPathError(path: string): string | undefined {
  if (!/^\/[A-Za-z0-9._/-]+$/.test(path) || path.length > 255 || path === "/" || path.includes("//") || path.endsWith("/")) return "Mount path must be an absolute path";
  if (path.split("/").some((part) => part === "." || part === "..")) return "Mount path cannot contain . or ..";
  if (["/proc", "/sys", "/dev", "/run/secrets"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return "That path is reserved";
  return undefined;
}

export function volumeSizeError(size: string): string | undefined {
  if (!/^[1-9][0-9]{0,4}(Mi|Gi)$/.test(size)) return "Size must be a whole Mi or Gi quantity";
  const value = Number(size.slice(0, -2)) * (size.endsWith("Gi") ? 1024 : 1);
  return value < 100 || value > 10240 ? "Size must be between 100Mi and 10Gi" : undefined;
}

export function volumeNameError(name: string): string | undefined {
  if (!name) return "Volume name is required";
  return /^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$/.test(name) ? undefined : "Use lowercase letters, digits and dashes (start with a letter)";
}
