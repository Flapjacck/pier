import { cn } from "../../../lib/cn";

export type SourceChoice = "git" | "image" | "railpack" | "buildkit";

const OPTIONS: Array<{
  id: SourceChoice;
  title: string;
  blurb: string;
  enabled: boolean;
  badge?: string;
}> = [
  { id: "git", title: "Git repository", blurb: "Clone a repo and build a Dockerfile with Kaniko.", enabled: true },
  { id: "image", title: "Container image", blurb: "Pull a pre-built image from a registry.", enabled: true },
  { id: "railpack", title: "Railpack / buildpack", blurb: "Auto-detect the stack with no Dockerfile.", enabled: false, badge: "Soon · #104" },
  { id: "buildkit", title: "BuildKit", blurb: "BuildKit-powered builds (alternative builder).", enabled: false, badge: "Soon · #104" },
];

export function SourceTypeStep({
  value,
  onChange,
}: {
  value: SourceChoice;
  onChange: (value: SourceChoice) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Deploy source">
      {OPTIONS.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!opt.enabled}
            onClick={() => opt.enabled && onChange(opt.id)}
            className={cn(
              "text-left rounded-pier-lg border p-4 transition-colors",
              selected && opt.enabled && "border-pier-accent bg-pier-accent/5",
              !selected && opt.enabled && "border-pier-border hover:border-pier-muted",
              !opt.enabled && "border-pier-border opacity-60 cursor-not-allowed",
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-semibold text-pier-fg">{opt.title}</span>
              {opt.badge && (
                <span className="text-[10px] uppercase tracking-wide text-pier-muted border border-pier-border rounded-full px-2 py-0.5">
                  {opt.badge}
                </span>
              )}
            </div>
            <p className="m-0 text-xs text-pier-muted">{opt.blurb}</p>
          </button>
        );
      })}
    </div>
  );
}
