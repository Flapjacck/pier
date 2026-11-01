import { useCallback, useMemo, useState } from "react";
import { useParams, Outlet, Link } from "react-router-dom";
import { getApp } from "../../api/client";
import { StatusPill } from "../../components/apps/StatusPill";
import { ThemeIllustration } from "../../components/brand/ThemeIllustration";
import { PierIcon } from "../../components/icons/PierIcon";
import { Button } from "../../components/ui/Button";
import { ExternalLink } from "../../components/ui/ExternalLink";
import { Skeleton } from "../../components/ui/Skeleton";
import { Tabs, type TabItem } from "../../components/ui/Tabs";
import { useApi } from "../../hooks/useApi";
import { formatRelativeTime } from "../../lib/time";
import { AppDetailContext } from "./useAppDetail";

/**
 * App detail layout: fetches app once and shares it with all tabs via Outlet context.
 * Header: app name, status, URL, refresh button, last updated.
 * Tabs: link-based navigation between overview, pods, logs, settings.
 * Loading/error states apply to all tabs (layout gates rendering).
 */
export function AppDetailLayout() {
  const { name } = useParams<{ name: string }>();
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>();

  const fetcher = useCallback(
    (signal: AbortSignal) => {
      if (!name) throw new Error("App name required");
      return getApp(name, { signal });
    },
    [name],
  );

  const { data: app, error, loading, refetch } = useApi(fetcher, [name]);
  const [localApp, setLocalApp] = useState(app);

  // Update local copy when app changes from API
  useMemo(() => {
    if (app) {
      setLocalApp(app);
      setLastUpdated(new Date());
    }
  }, [app]);

  const tabItems: TabItem[] = useMemo(
    () => [
      { to: `/apps/${encodeURIComponent(name || "")}`, label: "Overview", end: true },
      { to: `/apps/${encodeURIComponent(name || "")}/pods`, label: "Pods" },
      { to: `/apps/${encodeURIComponent(name || "")}/logs`, label: "Logs" },
      { to: `/apps/${encodeURIComponent(name || "")}/settings`, label: "Settings" },
    ],
    [name],
  );

  if (loading) {
    return (
      <div className="max-w-4xl">
        <div className="bg-pier-bg border border-pier-border rounded-pier-lg p-6 mb-4">
          {/* Skeleton header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-5 w-24" />
          </div>

          {/* Skeleton tabs */}
          <div className="flex gap-4 border-b border-pier-border mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error?.kind === "not_found") {
    return (
      <div className="max-w-3xl">
        <div className="bg-pier-bg border border-pier-border rounded-pier-lg p-6">
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <ThemeIllustration
              base="lost-container-colour"
              alt="Lost container illustration"
              width={240}
            />
            <div>
              <p className="text-sm m-0">
                <strong className="text-pier-fg">App not found</strong>
                <br />
                <span className="text-pier-muted">
                  The app "{name}" does not exist.
                </span>
              </p>
            </div>
            <Link to="/apps">
              <Button variant="secondary">
                <PierIcon name="rollback" size={14} />
                Back to apps
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    const errorMessage =
      error.kind === "network" || error.kind === "unavailable"
        ? "Could not reach the cluster. Check that the backend is running."
        : error.message;

    return (
      <div className="max-w-3xl">
        <div className="bg-pier-bg border border-pier-border rounded-pier-lg p-6">
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

  if (!localApp) return null;

  return (
    <AppDetailContext.Provider value={{ app: localApp, refetch, setApp: setLocalApp }}>
      <div className="max-w-4xl">
        <div className="bg-pier-bg border border-pier-border rounded-pier-lg p-6 mb-4">
          {/* Header: name, status, URL, refresh, updated timestamp */}
          <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <div>
              <h1 className="m-0 text-[21px] font-bold text-pier-fg mb-2 leading-tight">
                {localApp.name}
              </h1>
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <StatusPill status={localApp.status} />
                {localApp.url && (
                  <>
                    <span className="text-pier-muted">•</span>
                    <ExternalLink href={localApp.url} className="text-[13px]">
                      {new URL(localApp.url).hostname}
                    </ExternalLink>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2 items-start">
              <Button
                onClick={refetch}
                variant="secondary"
                size="sm"
                title="Refresh app data"
              >
                <PierIcon name="rollback" size={14} />
              </Button>
            </div>
          </div>

          {/* Last updated */}
          {lastUpdated && (
            <p className="text-xs text-pier-muted m-0 mb-6">
              Updated {formatRelativeTime(lastUpdated.toISOString())}
            </p>
          )}

          {/* Tabs */}
          <Tabs items={tabItems} aria-label="App detail tabs" />
        </div>

        {/* Tab content */}
        <div className="bg-pier-bg border border-pier-border rounded-pier-lg p-6">
          <Outlet />
        </div>
      </div>
    </AppDetailContext.Provider>
  );
}
