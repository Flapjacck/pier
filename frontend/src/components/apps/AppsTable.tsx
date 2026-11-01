import { Link } from "react-router-dom";
import type { App } from "../../api/types";
import { formatRelativeTime } from "../../lib/time";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../ui/Table";
import { ExternalLink } from "../ui/ExternalLink";
import { StatusPill } from "./StatusPill";

interface Props {
  apps: App[];
  isLoading?: boolean;
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
                <ExternalLink href={app.url} className="text-[12.5px]">
                  {new URL(app.url).hostname}
                </ExternalLink>
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
