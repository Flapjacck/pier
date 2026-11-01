import { Link } from "react-router-dom";
import type { App } from "../../api/types";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../ui/Table";
import { StatusPill } from "./StatusPill";

interface Props {
  apps: App[];
  isLoading?: boolean;
}

function formatRelativeTime(isoString: string): string {
  const now = new Date();
  const date = new Date(isoString);
  const secs = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (secs < 60) return "now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Apps list table over shared Table* primitives.
 * Columns: Name (link), Status, Ready (ready/replicas), Image, URL, Created.
 * Rows are keyboard-accessible links; whole row is clickable on hover.
 */
export function AppsTable({ apps, isLoading }: Props) {
  const columnCount = 6;

  if (isLoading) {
    return (
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Name</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Ready</TableHeaderCell>
            <TableHeaderCell>Image</TableHeaderCell>
            <TableHeaderCell>URL</TableHeaderCell>
            <TableHeaderCell>Created</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Array.from({ length: 4 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="h-5 w-24 rounded-pier bg-pier-surface-2 motion-safe:animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-5 w-20 rounded-pier bg-pier-surface-2 motion-safe:animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-5 w-12 rounded-pier bg-pier-surface-2 motion-safe:animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-5 w-32 rounded-pier bg-pier-surface-2 motion-safe:animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-5 w-16 rounded-pier bg-pier-surface-2 motion-safe:animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-5 w-20 rounded-pier bg-pier-surface-2 motion-safe:animate-pulse" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (apps.length === 0) {
    return <TableEmpty colSpan={columnCount}>No apps found.</TableEmpty>;
  }

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Name</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell>Ready</TableHeaderCell>
          <TableHeaderCell>Image</TableHeaderCell>
          <TableHeaderCell>URL</TableHeaderCell>
          <TableHeaderCell>Created</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {apps.map((app) => (
          <TableRow key={app.name} className="cursor-pointer">
            <TableCell>
              <Link
                to={`/apps/${encodeURIComponent(app.name)}`}
                className="font-semibold text-pier-fg hover:text-pier-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pier-focus rounded-sm"
              >
                {app.name}
              </Link>
            </TableCell>
            <TableCell>
              <StatusPill status={app.status} />
            </TableCell>
            <TableCell className="text-right font-mono text-[12.5px]">
              {app.ready}/{app.replicas}
            </TableCell>
            <TableCell className="max-w-sm">
              <code className="font-mono text-[12.5px] text-pier-fg truncate block" title={app.image}>
                {app.image}
              </code>
            </TableCell>
            <TableCell>
              {app.url ? (
                <a
                  href={app.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-pier-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pier-focus rounded-sm inline-flex items-center gap-1"
                >
                  <span className="text-[12.5px]">
                    {new URL(app.url).hostname}
                  </span>
                  <svg
                    width="12"
                    height="12"
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
              ) : (
                <span className="text-pier-muted">—</span>
              )}
            </TableCell>
            <TableCell>
              <time
                dateTime={app.createdAt}
                title={new Date(app.createdAt).toISOString()}
                className="text-[12.5px] text-pier-muted"
              >
                {formatRelativeTime(app.createdAt)}
              </time>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
