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
 * - Syncs <html data-theme> so tokens.css switches the semantic tokens.
 * - Returns a toggle() that persists the user's choice.
 */
export function usePierTheme(): PierTheme {
  const [theme, setTheme] = useState<Theme>(detectTheme);

  // Apply data-theme attribute and persist whenever theme changes
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  // Follow OS changes only when the user hasn't explicitly set a preference
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      try {
        if (!localStorage.getItem(STORAGE_KEY)) {
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
    setTheme(prev => (prev === "light" ? "dark" : "light"));
  }

  return { theme, toggle };
}
