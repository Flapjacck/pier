import { useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { useCallback } from "react";
import { getApp } from "../api/client";
import { StatusPill } from "../components/apps/StatusPill";
import { ThemeIllustration } from "../components/brand/ThemeIllustration";
import { PierIcon } from "../components/icons/PierIcon";
import { Button } from "../components/ui/Button";
import { useApi } from "../hooks/useApi";

/**
 * App detail page placeholder — shows minimal app info from GET /api/apps/:name.
 * Loading: skeleton.
 * 404: lost-container illustration with link back.
 * Error: inline error with retry.
 * Data: name, status, image, ready/replicas, port, URL, created time.
 * TODO(#45): tabs (overview, pods, logs, settings).
 */
export function AppDetailPage() {
  const { name } = useParams<{ name: string }>();

  const fetcher = useCallback(
    (signal: AbortSignal) => {
      if (!name) throw new Error("App name required");
      return getApp(name, { signal });
    },
    [name],
  );

  const { data: app, error, loading, refetch } = useApi(fetcher, [name]);

  if (loading) {
    return (
      <div className="max-w-3xl">
        <div className="bg-pier-bg border border-pier-border rounded-pier-lg p-6 mb-4">
          {/* Skeleton header */}
          <div className="flex items-center gap-3 mb-6 flex-wrap gap-4">
            <div className="h-8 w-32 rounded-pier bg-pier-surface-2 motion-safe:animate-pulse" />
            <div className="h-6 w-24 rounded-full bg-pier-surface-2 motion-safe:animate-pulse" />
          </div>
          {/* Skeleton rows */}
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="h-5 w-24 rounded-pier bg-pier-surface-2 motion-safe:animate-pulse shrink-0" />
                <div className="h-5 flex-1 rounded-pier bg-pier-surface-2 motion-safe:animate-pulse" />
              </div>
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

  if (!app) return null;

  return (
    <div className="max-w-3xl">
      <div className="bg-pier-bg border border-pier-border rounded-pier-lg p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <h1 className="m-0 text-2xl font-bold text-pier-fg leading-none">
            {app.name}
          </h1>
          <StatusPill status={app.status} />
        </div>

        {/* Info rows */}
        <div className="space-y-3 text-sm">
          {/* Status */}
          <div className="flex gap-4">
            <span className="text-pier-muted font-semibold w-24 shrink-0">
              Status
            </span>
            <span className="text-pier-fg">{app.status}</span>
          </div>

          {/* Replicas */}
          <div className="flex gap-4">
            <span className="text-pier-muted font-semibold w-24 shrink-0">
              Ready
            </span>
            <code className="font-mono text-pier-fg">{app.ready}/{app.replicas}</code>
          </div>

          {/* Image */}
          <div className="flex gap-4">
            <span className="text-pier-muted font-semibold w-24 shrink-0">
              Image
            </span>
            <code
              className="font-mono text-pier-fg truncate"
              title={app.image}
            >
              {app.image}
            </code>
          </div>

          {/* Port */}
          {app.port && (
            <div className="flex gap-4">
              <span className="text-pier-muted font-semibold w-24 shrink-0">
                Port
              </span>
              <span className="text-pier-fg">{app.port}</span>
            </div>
          )}

          {/* URL */}
          {app.url && (
            <div className="flex gap-4">
              <span className="text-pier-muted font-semibold w-24 shrink-0">
                URL
              </span>
              <a
                href={app.url}
                target="_blank"
                rel="noreferrer"
                className="text-pier-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pier-focus rounded-sm inline-flex items-center gap-1 truncate"
              >
                <span className="truncate">{app.url}</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                  aria-hidden
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>
          )}

          {/* Created */}
          <div className="flex gap-4">
            <span className="text-pier-muted font-semibold w-24 shrink-0">
              Created
            </span>
            <time
              dateTime={app.createdAt}
              title={new Date(app.createdAt).toISOString()}
              className="text-pier-muted"
            >
              {formatRelativeTime(app.createdAt)}
            </time>
          </div>
        </div>
      </div>

      {/* TODO(#45): tabs (overview, pods, logs, settings) */}
    </div>
  );
}

function formatRelativeTime(isoString: string): string {
  const now = new Date();
  const date = new Date(isoString);
  const secs = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (secs < 60) return "now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
