import { Link, useParams } from "react-router-dom";
import type { PierTheme } from "../hooks/usePierTheme";
import { MOCK_APP_DETAILS } from "../data/mockApps";
import { MainLayout } from "../components/layout/MainLayout";
import { StatusPill } from "../components/apps/StatusPill";
import { StatCard } from "../components/ui/StatCard";
import { Button } from "../components/ui/Button";
import { PierIcon } from "../components/icons/PierIcon";

interface Props extends PierTheme {}

const TDKey =
  "py-2.5 text-[11.5px] font-semibold tracking-wide uppercase text-pier-muted w-36 pr-4 align-top border-b border-pier-border";
const TDVal =
  "py-2.5 text-sm text-pier-fg border-b border-pier-border";

/** App detail — navigated to by clicking a row in AppsTable. */
export function AppDetailPage({ theme, toggle }: Props) {
  const { name } = useParams<{ name: string }>();
  const app = name ? MOCK_APP_DETAILS[name] : undefined;

  return (
    <MainLayout theme={theme} toggle={toggle}>
      {/* Breadcrumb */}
      <div className="mb-4 text-[13px] text-pier-muted flex items-center gap-1.5">
        <Link to="/apps" className="text-pier-accent hover:underline font-medium text-[13px]">
          Apps
        </Link>
        <span className="text-pier-subtle">›</span>
        <span className="text-pier-fg">{name ?? "—"}</span>
      </div>

      {!app ? (
        <div className="bg-pier-bg border border-pier-border rounded-xl p-6">
          <p className="text-pier-muted text-sm m-0">App not found.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Hero card */}
          <div className="bg-pier-bg border border-pier-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <h1 className="m-0 text-2xl font-bold text-pier-fg leading-none">{app.name}</h1>
              <StatusPill status={app.status} />
              <span className="text-[13px] text-pier-muted ml-auto">{app.ago}</span>
              <Button variant="secondary">
                <PierIcon name="rollback" size={14} />
                Rollback
              </Button>
              <Button>
                <PierIcon name="deploy" size={14} />
                Deploy
              </Button>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Replicas"
                value={`${app.replicas.ready} / ${app.replicas.total}`}
                sub="ready / total"
              />
              <StatCard label="CPU"    value={app.cpuUsage} sub={`limit ${app.cpuLimit} cores`} />
              <StatCard label="Memory" value={app.memUsage} sub={`limit ${app.memLimit}`} />
              <StatCard label="Namespace" value={app.namespace} />
            </div>
          </div>

          {/* Details card */}
          <div className="bg-pier-bg border border-pier-border rounded-xl p-6">
            <h2 className="m-0 mb-3 text-[15px] font-semibold text-pier-fg">Details</h2>
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className={TDKey}>Image</td>
                  <td className={TDVal}><code className="font-mono text-[12.5px]">{app.image}</code></td>
                </tr>
                <tr>
                  <td className={TDKey}>Git ref</td>
                  <td className={TDVal}><code className="font-mono text-[12.5px]">{app.ref}</code></td>
                </tr>
                {app.domain && (
                  <tr>
                    <td className={TDKey}>Domain</td>
                    <td className={TDVal}>
                      <a href={`https://${app.domain}`} className="text-pier-accent hover:underline"
                         target="_blank" rel="noreferrer">{app.domain}</a>
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
      )}
    </MainLayout>
  );
}
