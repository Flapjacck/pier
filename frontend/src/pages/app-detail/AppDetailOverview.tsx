import { useEffect, useState } from "react";
import { listVolumes } from "../../api/client";
import type { Volume } from "../../api/types";
import { useAppDetail } from "./useAppDetail";
import { formatRelativeTime, formatAbsoluteDate } from "../../lib/time";

/**
 * Overview tab: app metadata as a definition list.
 * Columns: Image, Port, Replicas, Host, URL, Created.
 */
export function AppDetailOverview() {
  const { app } = useAppDetail();
  const [volumes, setVolumes] = useState<Volume[]>([]);
  useEffect(() => {
    void listVolumes().then(setVolumes).catch(() => undefined);
  }, []);

  return (
    <dl className="space-y-4">
      {/* Image */}
      <div className="flex gap-4">
        <dt className="text-[13px] font-semibold text-pier-muted w-24 shrink-0">
          Image
        </dt>
        <dd className="m-0">
          <code
            className="font-mono text-[12.5px] text-pier-fg break-all"
            title={app.image}
          >
            {app.image}
          </code>
        </dd>
      </div>

      {/* Port */}
      {app.port && (
        <div className="flex gap-4">
          <dt className="text-[13px] font-semibold text-pier-muted w-24 shrink-0">
            Port
          </dt>
          <dd className="m-0 text-[13px] text-pier-fg">{app.port}</dd>
        </div>
      )}

      {/* Replicas */}
      <div className="flex gap-4">
        <dt className="text-[13px] font-semibold text-pier-muted w-24 shrink-0">
          Replicas
        </dt>
        <dd className="m-0 font-mono text-[12.5px] text-pier-fg">
          {app.ready}/{app.replicas}
        </dd>
      </div>

      {/* Host */}
      {app.host && (
        <div className="flex gap-4">
          <dt className="text-[13px] font-semibold text-pier-muted w-24 shrink-0">
            Host
          </dt>
          <dd className="m-0 text-[13px] text-pier-fg">{app.host}</dd>
        </div>
      )}

      {/* URL */}
      {app.url && (
        <div className="flex gap-4">
          <dt className="text-[13px] font-semibold text-pier-muted w-24 shrink-0">
            URL
          </dt>
          <dd className="m-0">
            <a
              href={app.url}
              target="_blank"
              rel="noreferrer"
              className="text-pier-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pier-focus rounded-sm text-[13px] break-all"
              title={app.url}
            >
              {app.url}
            </a>
          </dd>
        </div>
      )}

      {/* Created */}
      <div className="flex gap-4">
        <dt className="text-[13px] font-semibold text-pier-muted w-24 shrink-0">
          Created
        </dt>
        <dd className="m-0 text-[13px]">
          <time
            dateTime={app.createdAt}
            title={formatAbsoluteDate(app.createdAt)}
            className="text-pier-muted"
          >
            {formatRelativeTime(app.createdAt)}
          </time>
        </dd>
      </div>
      {(app.volumes ?? []).length > 0 && (
        <div className="flex gap-4">
          <dt className="text-[13px] font-semibold text-pier-muted w-24 shrink-0">Volumes</dt>
          <dd className="m-0 text-[13px] text-pier-fg">
            <ul className="m-0 p-0 list-none space-y-1">
              {(app.volumes ?? []).map((mount) => {
                const volume = volumes.find((item) => item.name === mount.name);
                return <li key={mount.name}><code>{mount.name}</code> at <code>{mount.mountPath}</code> ({volume?.size ?? "unknown"})</li>;
              })}
            </ul>
          </dd>
        </div>
      )}
    </dl>
  );
}
