import { ThemeIllustration } from "../../components/brand/ThemeIllustration";

interface DeploySuccessProps {
  appName: string;
}

/**
 * Success state: app is deploying.
 */
export function DeploySuccess({ appName }: DeploySuccessProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <ThemeIllustration
        base="deployed-colour"
        alt="Success illustration"
        width={240}
      />
      <div>
        <p className="text-sm m-0">
          <strong className="text-pier-fg">{appName} is deploying</strong>
          <br />
          <span className="text-pier-muted">
            Check back in a moment to see the status.
          </span>
        </p>
      </div>
    </div>
  );
}
