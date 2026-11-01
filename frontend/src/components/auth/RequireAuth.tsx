import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { safeNext } from "../../lib/safeNext";
import { PierLoader } from "../brand/PierLoader";
import { UnreachablePage } from "../../pages/UnreachablePage";

export function RequireAuth() {
  const { status, retrySession } = useAuth();
  const location = useLocation();

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

  if (status === "anonymous") {
    const next = safeNext(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return <Outlet />;
}
