import { useMemo } from "react";
import { AppsTable } from "../components/apps/AppsTable";
import { ThemeIllustration } from "../components/brand/ThemeIllustration";
import { PierIcon } from "../components/icons/PierIcon";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useSetPageActions } from "../context/PageActionsContext";
import { useApps } from "../hooks/useApps";
import { useState, useMemo as useMemoReact } from "react";

/**
 * Apps list — landing view after login.
 * Loads from GET /api/apps with loading/error/empty states.
 * Supports client-side search by name.
 */
export function AppsPage() {
  const { apps, error, loading, refetch, lastUpdated } = useApps();
  const [search, setSearch] = useState("");

  const filteredApps = useMemoReact(() => {
    const query = search.toLowerCase().trim();
    if (!query) return apps;
    return apps.filter((app) => app.name.toLowerCase().includes(query));
  }, [apps, search]);

  const headerActions = useMemo(
    () => (
      <Button disabled title="Coming soon">
        <PierIcon name="deploy" size={14} />
        Deploy
      </Button>
    ),
    [],
  );
  useSetPageActions(headerActions);

  if (loading && apps.length === 0) {
    return (
      <div className="max-w-6xl">
        <header className="mb-6">
          <h1 className="m-0 text-[21px] font-bold text-pier-fg">Apps</h1>
          <p className="mt-1 mb-0 text-sm text-pier-muted">
            All services running on your cluster
          </p>
        </header>
        <div className="border border-pier-border rounded-pier-lg bg-pier-bg p-4 md:p-6">
          <AppsTable apps={[]} isLoading />
        </div>
      </div>
    );
  }

  if (error && apps.length === 0) {
    const errorMessage =
      error.kind === "network" || error.kind === "unavailable"
        ? "Could not reach the cluster. Check that the backend is running."
        : error.message;

    return (
      <div className="max-w-6xl">
        <header className="mb-6">
          <h1 className="m-0 text-[21px] font-bold text-pier-fg">Apps</h1>
          <p className="mt-1 mb-0 text-sm text-pier-muted">
            All services running on your cluster
          </p>
        </header>
        <div className="border border-pier-border rounded-pier-lg bg-pier-bg p-6">
          <div className="text-center">
            <p className="text-sm text-pier-muted mb-4">{errorMessage}</p>
            <Button onClick={refetch}>
              <PierIcon name="rollback" size={14} />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="max-w-6xl">
        <header className="mb-6">
          <h1 className="m-0 text-[21px] font-bold text-pier-fg">Apps</h1>
          <p className="mt-1 mb-0 text-sm text-pier-muted">
            All services running on your cluster
          </p>
        </header>
        <div className="border border-pier-border rounded-pier-lg bg-pier-bg p-6">
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <ThemeIllustration
              base="empty-dock-colour"
              alt="Empty dock illustration"
              width={240}
            />
            <div>
              <p className="text-sm m-0">
                <strong className="text-pier-fg">Nothing docked yet</strong>
                <br />
                <span className="text-pier-muted">
                  Deploy your first app to get started.
                </span>
              </p>
            </div>
            <Button disabled title="Coming soon">
              <PierIcon name="deploy" size={14} />
              Deploy an app
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Has apps and no error
  return (
    <div className="max-w-6xl">
      <header className="mb-6">
        <h1 className="m-0 text-[21px] font-bold text-pier-fg">Apps</h1>
        <p className="mt-1 mb-0 text-sm text-pier-muted">
          All services running on your cluster
        </p>
      </header>

      <div className="border border-pier-border rounded-pier-lg bg-pier-bg p-4 md:p-6">
        {/* Header controls: search, refresh, count */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <PierIcon name="search" size={14} className="text-pier-muted shrink-0" />
            <Input
              type="search"
              placeholder="Search apps by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
              aria-label="Search apps"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-pier-muted hover:text-pier-fg px-2 py-1 text-sm rounded-pier focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pier-focus"
                aria-label="Clear search"
              >
                Clear
              </button>
            )}
          </div>
          <Button onClick={refetch} variant="secondary" size="sm">
            <PierIcon name="rollback" size={14} />
            Refresh
          </Button>
        </div>

        {/* Metadata: count, last updated */}
        <div className="flex items-center gap-3 mb-4 text-xs text-pier-muted flex-wrap">
          <span>
            {filteredApps.length} {filteredApps.length === 1 ? "app" : "apps"}
          </span>
          {lastUpdated && (
            <>
              <span aria-hidden>•</span>
              <span>
                Updated {formatRelativeTime(lastUpdated)} ago
              </span>
            </>
          )}
        </div>

        {/* Table or empty search result */}
        {filteredApps.length === 0 && search ? (
          <div className="text-center py-8 text-pier-muted text-sm">
            No apps match "{search}"
          </div>
        ) : (
          <AppsTable apps={filteredApps} isLoading={false} />
        )}
      </div>

      {/* Live region for refresh announcements */}
      <div aria-live="polite" aria-atomic className="sr-only">
        {lastUpdated && `Last updated ${formatRelativeTime(lastUpdated)} ago`}
      </div>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const secs = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (secs < 60) return "now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
