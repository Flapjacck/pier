import { Link } from "react-router-dom";
import type { App } from "../../api/types";

/**
 * A git app whose first build is running or failed has no Deployment yet (#83), so
 * pods and logs are empty. Point at the deploy page, which keeps the build log either way.
 */
export function BuildStateBanner({ app }: { app: App }) {
  if (!app.source || app.deploymentId === undefined) return null;
  if (app.status !== "building" && app.status !== "failed") return null;
  const failed = app.status === "failed";
  const to = `/apps/${encodeURIComponent(app.name)}/deployments/${app.deploymentId}`;
  return (
    <div role={failed ? "alert" : "status"} className={`mb-6 rounded-pier-lg border p-3 text-sm ${failed ? "border-pier-status-failed/40 text-pier-status-failed-text" : "border-pier-border text-pier-muted"}`}>
      {failed ? "The build failed, so this app isn't running yet. " : "Pier is building this app from its repository. "}
      <Link to={to} className="text-pier-accent hover:underline">{failed ? "View build logs" : "Watch the build"}</Link>
    </div>
  );
}
