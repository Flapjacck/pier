import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { cn } from "../../lib/cn";
import { DeployAlerts } from "./DeployAlerts";
import { DeploySuccess } from "./DeploySuccess";
import { useDeployForm } from "./useDeployForm";
import { STEP_LABELS, stepsFor, type StepId } from "./wizardSteps";
import { AppStep } from "./steps/AppStep";
import { SourceStep } from "./steps/SourceStep";
import { ConnectStep } from "./steps/ConnectStep";
import { BuildStep } from "./steps/BuildStep";
import { RuntimeStep } from "./steps/RuntimeStep";
import { ReviewStep } from "./steps/ReviewStep";

interface Props {
  ingressDomain: string | null;
  tls?: boolean;
  onCancel: () => void;
}

/**
 * Deploy wizard (#83): App → Source → Connect → Build method → Runtime → Review.
 *
 * Only Review's Deploy creates anything. Every button is type="button" and the form's
 * submit (Enter in a field) only ever moves forward, because #103 shipped a Next that
 * turned into a submit button mid-click and deployed by accident.
 */
export function DeployWizard({ ingressDomain, tls = false, onCancel }: Props) {
  const { push: showToast } = useToast();
  const form = useDeployForm({ ingressDomain, onShowToast: showToast });
  const [step, setStep] = useState<StepId>("app");
  const steps = stepsFor(form.kind);
  const index = Math.max(0, steps.indexOf(step));

  // Move focus to the first broken field so keyboard users land on the fix.
  useEffect(() => {
    const key = Object.keys(form.errors).find((k) => k !== "form" && k !== "env");
    if (key) document.getElementById(`deploy-${key}`)?.focus();
  }, [form.errors]);

  if (form.submitState === "success") return <DeploySuccess appName={form.deployedApp} />;

  const goNext = () => {
    if (step === "review" || !form.validateStep(step)) return;
    const next = steps[index + 1] ?? "review";
    if (next === "runtime" && form.kind === "repo") form.source.refreshHints();
    setStep(next);
  };
  const goBack = () => setStep(steps[index - 1] ?? "app");
  const deploy = async () => {
    const fix = await form.submit();
    if (fix && fix !== "review") setStep(fix);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (step !== "review") goNext();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-2xl" noValidate>
      <ol className="flex flex-wrap gap-x-4 gap-y-1 m-0 p-0 list-none" aria-label="Deploy steps">
        {steps.map((id, i) => (
          <li key={id} aria-current={id === step ? "step" : undefined} className={cn("text-xs", id === step ? "text-pier-fg font-semibold" : i < index ? "text-pier-muted" : "text-pier-muted/60")}>
            {i + 1}. {STEP_LABELS[id]}
          </li>
        ))}
      </ol>
      <DeployAlerts submitState={form.submitState} errors={form.errors} ingressDomain={ingressDomain} />
      <section aria-label={STEP_LABELS[step]}>
        {step === "app" && <AppStep form={form} />}
        {step === "source" && <SourceStep form={form} />}
        {step === "connect" && <ConnectStep form={form} />}
        {step === "build" && <BuildStep form={form} />}
        {step === "runtime" && <RuntimeStep form={form} ingressDomain={ingressDomain} tls={tls} />}
        {step === "review" && <ReviewStep form={form} ingressDomain={ingressDomain} />}
      </section>
      <div className="flex gap-2 pt-2">
        {index > 0 && <Button type="button" variant="secondary" onClick={goBack} disabled={form.submitState === "pending"}>Back</Button>}
        {step === "review" ? (
          <Button type="button" onClick={() => void deploy()} disabled={form.submitState === "pending"}>
            {form.submitState === "pending" ? "Deploying…" : "Deploy"}
          </Button>
        ) : (
          <Button type="button" onClick={goNext}>Next</Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
