import { useEffect, useState } from "react";

/** Matches a CSS media query; updates when the viewport crosses the breakpoint. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/** True when viewport width is below 768px (mobile drawer layout). */
export function useIsMobileLayout(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
