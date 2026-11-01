import { useParams } from "react-router-dom";
import { StatusPill } from "../components/apps/StatusPill";
import { StatCard } from "../components/ui/StatCard";
import { MOCK_APP_DETAILS } from "../data/mockApps";

const TDKey =
  "py-2.5 text-[11.5px] font-semibold tracking-wide uppercase text-pier-muted w-36 pr-4 align-top border-b border-pier-border";
const TDVal =
  "py-2.5 text-sm text-pier-fg border-b border-pier-border";

/** App detail — navigated to by clicking a row in AppsTable. */
export function AppDetailPage() {
  const { name } = useParams<{ name: string }>();
  const app = name && Object.prototype.hasOwnProperty.call(MOCK_APP_DETAILS, name)
    ? MOCK_APP_DETAILS[name as keyof typeof MOCK_APP_DETAILS]
    : undefined;

  if (!app) {
    return (
      <div className="border border-pier-border rounded-pier-lg p-6 bg-pier-bg max-w-3xl">
        <p className="text-pier-muted text-sm m-0">App not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="bg-pier-bg border border-pier-border rounded-pier-lg p-6">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <h1 className="m-0 text-2xl font-bold text-pier-fg leading-none">{app.name}</h1>
          <StatusPill status={app.status} />
          <span className="text-[13px] text-pier-muted ml-auto">{app.ago}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Replicas"
            value={`${app.replicas.ready} / ${app.replicas.total}`}
            sub="ready / total"
          />
          <StatCard label="CPU" value={app.cpuUsage} sub={`limit ${app.cpuLimit} cores`} />
          <StatCard label="Memory" value={app.memUsage} sub={`limit ${app.memLimit}`} />
          <StatCard label="Namespace" value={app.namespace} />
        </div>
      </div>

      <div className="bg-pier-bg border border-pier-border rounded-pier-lg p-6">
        <h2 className="m-0 mb-3 text-[15px] font-semibold text-pier-fg">Details</h2>
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className={TDKey}>Image</td>
              <td className={TDVal}>
                <code className="font-mono text-[12.5px]">{app.image}</code>
              </td>
            </tr>
            <tr>
              <td className={TDKey}>Git ref</td>
              <td className={TDVal}>
                <code className="font-mono text-[12.5px]">{app.ref}</code>
              </td>
            </tr>
            {app.domain && (
              <tr>
                <td className={TDKey}>Domain</td>
                <td className={TDVal}>
                  <a
                    href={`https://${app.domain}`}
                    className="text-pier-accent hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {app.domain}
                  </a>
                </td>
              </tr>
            )}
            {app.port && (
              <tr>
                <td className={TDKey}>Port</td>
                <td className={TDVal}>{app.port}</td>
              </tr>
            )}
            <tr className="[&>td]:border-b-0">
              <td className={TDKey}>Last deploy</td>
              <td className={TDVal + " text-pier-muted"}>{app.ago}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
