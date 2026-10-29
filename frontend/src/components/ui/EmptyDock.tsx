import type { Theme } from "../../hooks/usePierTheme";

interface Props { theme: Theme; }

/**
 * Empty state illustration + copy.
 * Uses the colour illustration variant for the current theme.
 */
export function EmptyDock({ theme }: Props) {
  const src =
    theme === "dark"
      ? "/illustrations/empty-dock-colour-dark.svg"
      : "/illustrations/empty-dock-colour-light.svg";

  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <img src={src} width={240} height={135} alt="Empty dock illustration" />
      <p className="text-sm m-0">
        <strong className="text-pier-fg">Nothing docked yet</strong>
        <br />
        <span className="text-pier-muted">Push a repo to deploy your first app.</span>
      </p>
    </div>
  );
}
