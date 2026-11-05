import { cn } from "../../../lib/cn";

const METHODS = [
  { id: "dockerfile", title: "Dockerfile (Kaniko)", blurb: "Build the Dockerfile in your repo or folder.", enabled: true },
  { id: "railpack", title: "Railpack", blurb: "No Dockerfile — detect and build the stack.", enabled: false, badge: "Soon · #104" },
  { id: "buildkit", title: "BuildKit", blurb: "Dockerfile via BuildKit instead of Kaniko.", enabled: false, badge: "Soon · #104" },
] as const;

export function BuildMethodStep() {
  return (
    <div className="grid gap-3" role="radiogroup" aria-label="Build method">
      {METHODS.map((m) => (
        <div
          key={m.id}
          role="radio"
          aria-checked={m.enabled}
          aria-disabled={!m.enabled}
          className={cn(
            "rounded-pier-lg border p-4",
            m.enabled ? "border-pier-accent bg-pier-accent/5" : "border-pier-border opacity-60",
          )}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-semibold text-pier-fg">{m.title}</span>
            {"badge" in m && m.badge && (
              <span className="text-[10px] uppercase tracking-wide text-pier-muted border border-pier-border rounded-full px-2 py-0.5">
                {m.badge}
              </span>
            )}
          </div>
          <p className="m-0 text-xs text-pier-muted">{m.blurb}</p>
        </div>
      ))}
    </div>
  );
}
