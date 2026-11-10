/**
 * Copy text even on plain HTTP. navigator.clipboard only exists in secure contexts,
 * and the dashboard is often served over http://*.nip.io, so fall back to a hidden
 * textarea + execCommand("copy") (deprecated, but the only option there).
 */
export async function copyText(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  try {
    area.select();
    if (!document.execCommand("copy")) throw new Error("Copy was blocked by the browser");
  } finally {
    document.body.removeChild(area);
  }
}
