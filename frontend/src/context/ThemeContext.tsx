import { createContext, useContext, type ReactNode } from "react";
import { usePierTheme, type PierTheme, type Theme } from "../hooks/usePierTheme";

const ThemeContext = createContext<PierTheme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = usePierTheme();
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Theme state shared across shell, pages, and brand components. */
export function useTheme(): PierTheme {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

export type { Theme };
