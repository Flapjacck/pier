import type { PierTheme } from "../hooks/usePierTheme";
import { MainLayout } from "../components/layout/MainLayout";
import { PageHeader } from "../components/layout/PageHeader";
import { AppsTable } from "../components/apps/AppsTable";
import { Button } from "../components/ui/Button";
import { PierIcon } from "../components/icons/PierIcon";
import { MOCK_APPS } from "../data/mockApps";

/**
 * Apps list — landing view after login.
 * Content floats as a card over the slats pattern background.
 */
export function AppsPage({ theme, toggle }: PierTheme) {
  return (
    <MainLayout theme={theme} toggle={toggle}>
      {/* Card floating over pattern */}
      <div className="bg-pier-bg border border-pier-border rounded-xl p-6 shadow-sm">
        <PageHeader
          title="Apps"
          description="All services running on your cluster"
          actions={
            <Button>
              <PierIcon name="deploy" size={14} />
              Deploy
            </Button>
          }
        />
        <AppsTable apps={MOCK_APPS} />
      </div>
    </MainLayout>
  );
}
