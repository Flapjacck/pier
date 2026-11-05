import { cn } from "../../../lib/cn";

type Step = { id: string; label: string };

export function StepIndicator({ steps, current }: { steps: Step[]; current: number }) {
  return (
    <ol className="flex flex-wrap gap-2 mb-6" aria-label="Deploy steps">
      {steps.map((step, index) => {
        const active = index === current;
        const done = index < current;
        return (
          <li
            key={step.id}
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1 text-xs border",
              active && "border-pier-accent bg-pier-accent/10 text-pier-fg font-semibold",
              done && "border-pier-border text-pier-muted",
              !active && !done && "border-pier-border text-pier-subtle",
            )}
            aria-current={active ? "step" : undefined}
          >
            <span className="font-mono">{index + 1}</span>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
