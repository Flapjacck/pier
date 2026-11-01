import { useTheme } from "../../context/ThemeContext";

function SunIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1"  x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22"  y1="4.22"  x2="5.64"  y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1"  y1="12" x2="3"  y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36" />
      <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" className="shrink-0">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

interface Props {
  /** Icon-only for collapsed sidebar rail */
  compact?: boolean;
}

/** Sun/moon toggle pinned to the sidebar footer. Persists via localStorage. */
export function ThemeToggle({ compact = false }: Props) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={compact ? (isDark ? "Light mode" : "Dark mode") : undefined}
      className="flex items-center gap-2 w-full px-2.5 py-[7px] rounded-pier bg-transparent
                 border-none text-[13px] font-sans text-pier-muted cursor-pointer text-left
                 transition-colors hover:bg-pier-surface-2 hover:text-pier-fg
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pier-focus
                 justify-center md:justify-start"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
      {!compact && (isDark ? "Light mode" : "Dark mode")}
    </button>
  );
}
