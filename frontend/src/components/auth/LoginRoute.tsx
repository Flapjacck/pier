import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { safeNext } from "../../lib/safeNext";
import { LoginPage } from "../../pages/LoginPage";
import { TokenRequiredPage } from "../../pages/TokenRequiredPage";
import { PierLoader } from "../brand/PierLoader";
import { UnreachablePage } from "../../pages/UnreachablePage";

export function LoginRoute() {
  const { status, authDisabled, retrySession } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  if (status === "checking") {
    return (
      <div className="flex min-h-svh items-center justify-center bg-pier-bg">
        <PierLoader size={96} label="Checking session…" />
      </div>
    );
  }

  if (status === "unreachable") {
    return <UnreachablePage onRetry={retrySession} />;
  }

  if (status === "authenticated") {
    return <Navigate to={next} replace />;
  }

  if (authDisabled) {
    return <TokenRequiredPage onRetry={retrySession} />;
  }

  return <LoginPage nextPath={next} />;
}
