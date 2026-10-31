import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

export interface PierTheme {
  theme: Theme;
  toggle: () => void;
}

const STORAGE_KEY = "pier-theme";

function detectTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch { /* localStorage unavailable */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Manages the Pier UI theme.
 * - Reads the stored preference from localStorage on first load.
 * - Falls back to the OS colour scheme if no preference is stored.
 * - Syncs <html data-theme> and theme-color meta so tokens.css switches semantic tokens
 *   and the browser tab bar reflects the active theme.
 * - toggle() stops following OS changes and persists the user's choice.
 */
export function usePierTheme(): PierTheme {
  const [theme, setTheme] = useState<Theme>(detectTheme);

  // Set data-theme attribute and theme-color meta whenever theme changes
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    const themeColor = theme === "light" ? "#ffffff" : "#000000";
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", themeColor);
    }
  }, [theme]);

  // Follow OS changes only when the user hasn't explicitly set a preference
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      try {
        if (!Object.prototype.hasOwnProperty.call(localStorage, STORAGE_KEY)) {
          setTheme(e.matches ? "dark" : "light");
        }
      } catch {
        setTheme(e.matches ? "dark" : "light");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch { /* ignore */ }
  }

  return { theme, toggle };
}
