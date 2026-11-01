import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";
import { ThemeIllustration } from "../components/brand/ThemeIllustration";
import { Button } from "../components/ui/Button";

function errorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    return `${error.status} ${error.statusText}${error.data ? `: ${String(error.data)}` : ""}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export function ErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();
  const showDetails = import.meta.env.DEV;

  return (
    <div className="flex flex-col items-center justify-center min-h-svh py-16 px-4 text-center bg-pier-bg">
      <ThemeIllustration base="rough-waters-colour" alt="" className="mb-6" width={280} />
      <h1 className="m-0 text-xl font-bold text-pier-fg">Something went wrong</h1>
      <p className="mt-2 mb-6 text-sm text-pier-muted m-0 max-w-md">
        The dashboard hit rough water. Try reloading, or return to your apps list.
      </p>
      {showDetails && (
        <details className="mb-6 max-w-lg w-full text-left">
          <summary className="text-[13px] text-pier-muted cursor-pointer">Error details</summary>
          <pre className="mt-2 p-3 rounded-pier bg-pier-surface-2 border border-pier-border text-[12px] font-mono overflow-auto text-pier-fg">
            {errorMessage(error)}
          </pre>
        </details>
      )}
      <div className="flex flex-wrap gap-2 justify-center">
        <Button type="button" variant="secondary" onClick={() => navigate("/apps")}>
          Back to apps
        </Button>
        <Button type="button" variant="primary" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  );
}
