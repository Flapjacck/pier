import { Link, useNavigate } from "react-router-dom";
import type { AppRow } from "../../types/app";
import { StatusPill } from "./StatusPill";

interface Props { apps: AppRow[]; }

const TH = "text-left text-[11px] font-semibold tracking-wider uppercase " +
           "text-pier-muted pb-2.5 px-2 border-b border-pier-border";

/**
 * Clickable apps table. Each row navigates to /apps/:name.
 * Name cell is a keyboard-accessible <Link> with focus ring; row click provides mouse fallback.
 * Uses Tailwind group + group-hover for row highlight without CSS classes.
 * Horizontal scroll on narrow viewports.
 */
export function AppsTable({ apps }: Props) {
  const navigate = useNavigate();

  const handleRowClick = (name: string) => {
    navigate(`/apps/${encodeURIComponent(name)}`);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={TH}>Name</th>
            <th className={TH}>Status</th>
            <th className={TH}>Last deploy</th>
            <th className={TH}>Ref</th>
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => (
            <tr
              key={app.name}
              className="group cursor-pointer border-b border-pier-border last:border-b-0"
              onClick={() => handleRowClick(app.name)}
              title={`View ${app.name}`}
            >
              <td className="py-2.5 px-2 group-hover:bg-pier-surface transition-colors">
                <Link
                  to={`/apps/${encodeURIComponent(app.name)}`}
                  className="font-semibold text-pier-fg focus-visible:outline-2 focus-visible:outline-pier-accent focus-visible:outline-offset-2 rounded-sm focus-visible:bg-pier-surface block"
                  onClick={(e) => e.stopPropagation()}
                >
                  {app.name}
                </Link>
              </td>
              <td className="py-2.5 px-2 group-hover:bg-pier-surface transition-colors">
                <StatusPill status={app.status} />
              </td>
              <td className="py-2.5 px-2 text-pier-muted text-[13px] group-hover:bg-pier-surface transition-colors">
                {app.ago}
              </td>
              <td className="py-2.5 px-2 group-hover:bg-pier-surface transition-colors">
                <code className="font-mono text-[12px] text-pier-fg">{app.ref}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
