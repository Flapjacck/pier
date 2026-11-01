import { ThemeIllustration } from "../components/brand/ThemeIllustration";
import { Button } from "../components/ui/Button";

interface Props {
  onRetry: () => void;
}

export function TokenRequiredPage({ onRetry }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-svh py-16 px-4 text-center bg-pier-bg">
      <ThemeIllustration base="maintenance-colour" alt="" className="mb-6" width={280} />
      <h1 className="m-0 text-xl font-bold text-pier-fg">API token required</h1>
      <p className="mt-2 mb-6 text-sm text-pier-muted m-0 max-w-md">
        Set <code className="text-pier-fg">PIER_API_TOKEN</code> in{" "}
        <code className="text-pier-fg">backend/.env</code> and restart the backend, then retry.
      </p>
      <Button type="button" variant="primary" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
