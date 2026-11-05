import { useEffect, useRef, useState } from "react";
import type { DeployDetail, DeployStep, DeployStepStatus } from "../../api/types";
import { cn } from "../../lib/cn";
import { formatDuration } from "../../lib/deploys";

const STATUS_TEXT: Record<DeployStepStatus, string> = {
  pending: "Pending",
  running: "In progress",
  succeeded: "Done",
  failed: "Failed",
  skipped: "Skipped",
};

function StepMarker({ step, index }: { step: DeployStep; index: number }) {
  if (step.status === "running") {
    return (
      <span
        role="img"
        aria-label="In progress"
        className="inline-block h-5 w-5 rounded-full border-2 border-pier-status-building-icon border-t-transparent animate-spin"
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
        step.status === "succeeded" && "bg-pier-status-running-bg text-pier-status-running",
        step.status === "failed" && "bg-pier-status-failed-bg text-pier-status-failed",
        (step.status === "pending" || step.status === "skipped") && "bg-pier-surface-2 text-pier-muted",
      )}
    >
      {step.status === "succeeded" ? "✓" : step.status === "failed" ? "✕" : index + 1}
    </span>
  );
}

/** Output lines; sticks to the bottom while open and running unless the user scrolled up. */
function StepLines({ step, follow }: { step: DeployStep; follow: boolean }) {
  const ref = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && follow && pinned.current) el.scrollTop = el.scrollHeight;
  }, [step.lines.length, follow]);
  if (step.lines.length === 0) return <p className="m-0 text-xs text-pier-muted">No output yet.</p>;
  return (
    <ol
      ref={ref}
      aria-label={`${step.label} output`}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
      }}
      className="m-0 max-h-60 list-none overflow-y-auto rounded-pier bg-pier-surface-2 p-3 font-mono text-xs"
    >
      {step.lines.map((line, i) => (
        <li
          key={`${line.ts}-${i}`}
          className={cn(
            "whitespace-pre-wrap break-words",
            line.level === "warning" && "text-pier-status-building",
            line.level === "error" && "text-pier-status-failed",
          )}
        >
          {line.text}
        </li>
      ))}
    </ol>
  );
}

function StepRow({ step, index, reason, deployId }: { step: DeployStep; index: number; reason: string | null; deployId: number }) {
  const auto = step.status === "running" || step.status === "failed";
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? auto;
  const panelId = `deploy-${deployId}-step-${step.name}`;
  return (
    <li className={cn("border-b border-pier-border last:border-b-0", step.status === "failed" && "bg-pier-status-failed-bg/40")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setManual(!open)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-pier-focus"
      >
        <StepMarker step={step} index={index} />
        <span className={cn("flex-1 font-medium", step.status === "failed" ? "text-pier-status-failed" : "text-pier-fg", step.status === "skipped" && "text-pier-muted")}>
          {step.label}
        </span>
        <span className="text-xs text-pier-muted">{STATUS_TEXT[step.status]}</span>
        <span className="w-16 text-right font-mono text-xs text-pier-muted">
          {step.durationMs !== null ? formatDuration(step.durationMs) : ""}
        </span>
      </button>
      {open && (
        <div id={panelId} className="px-3 pb-3 pl-11">
          {step.status === "failed" && reason && (
            <p role="alert" className="m-0 mb-2 text-sm text-pier-status-failed">{reason}</p>
          )}
          <StepLines step={step} follow={step.status === "running"} />
        </div>
      )}
    </li>
  );
}

/** Numbered, collapsible deploy steps. Running and failed steps open by themselves. */
export function DeploySteps({ deployment }: { deployment: DeployDetail }) {
  return (
    <ol aria-label="Deploy steps" className="m-0 list-none rounded-pier-lg border border-pier-border p-0">
      {deployment.steps.map((step, i) => (
        <StepRow key={`${deployment.id}-${step.name}`} step={step} index={i} reason={deployment.reason} deployId={deployment.id} />
      ))}
    </ol>
  );
}
