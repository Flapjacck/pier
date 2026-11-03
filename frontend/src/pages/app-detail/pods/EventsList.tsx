import type { AppEvent } from "../../../api/types";
import { formatRelativeTime } from "../../../lib/time";

export function EventsList({ events }: { events: AppEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-pier-muted">No recent events (Kubernetes keeps them for about an hour).</p>;
  return <div className="divide-y divide-pier-border">{events.map((event, index) => {
    const summary = event.summary ?? event.message;
    return <article key={`${event.lastSeen ?? "event"}-${event.reason}-${index}`} className="py-3 first:pt-0">
      <div className="flex items-start gap-2">
        <span className={event.type === "Warning" ? "rounded bg-pier-status-failed-bg px-2 py-0.5 text-xs text-pier-status-failed-text" : "rounded bg-pier-status-running-bg px-2 py-0.5 text-xs text-pier-status-running-text"}>{event.type}</span>
        <p className="m-0 text-sm" title={event.summary ? event.message : undefined}>{summary}</p>
      </div>
      <p className="m-0 mt-1 text-xs text-pier-muted">{event.reason} · {event.object.kind}/{event.object.name} · ×{event.count} · {event.lastSeen ? formatRelativeTime(event.lastSeen) : "unknown"}</p>
    </article>;
  })}</div>;
}
