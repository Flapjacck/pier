import { DeployList } from "../../components/deploys/DeployList";
import { PierIcon } from "../../components/icons/PierIcon";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { useDeployments } from "../../hooks/useDeployments";
import { useAppDetail } from "./useAppDetail";

/** Deployments tab: the app's deploy history, newest first (refreshes while one is running). */
export function AppDetailDeployments() {
  const { app } = useAppDetail();
  const { deployments, error, loading, loadingMore, hasMore, loadMore, refetch } = useDeployments(app.name);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="m-0 text-base font-semibold text-pier-fg">Deployments</h2>
        <Button onClick={refetch} variant="secondary" size="sm" disabled={loading}>
          <PierIcon name="rollback" size={14} />
          Refresh
        </Button>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-pier-status-failed">
          {error.kind === "network" || error.kind === "unavailable" ? "Could not reach the backend." : error.message}
        </p>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : (
        !error || deployments.length > 0 ? <DeployList app={app.name} deployments={deployments} /> : null
      )}

      {hasMore && !loading && (
        <div className="mt-4 flex justify-center">
          <Button onClick={loadMore} variant="secondary" size="sm" disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
