import { useMemo } from "react";
import { AppsTable } from "../components/apps/AppsTable";
import { PierIcon } from "../components/icons/PierIcon";
import { Button } from "../components/ui/Button";
import { useSetPageActions } from "../context/PageActionsContext";
import { MOCK_APPS } from "../data/mockApps";

/**
 * Apps list — landing view after login.
 */
export function AppsPage() {
  const headerActions = useMemo(
    () => (
      <Button disabled title="Coming soon">
        <PierIcon name="deploy" size={14} />
        Deploy
      </Button>
    ),
    [],
  );
  useSetPageActions(headerActions);

  return (
    <div className="max-w-6xl">
      <header className="mb-6">
        <h1 className="m-0 text-[21px] font-bold text-pier-fg">Apps</h1>
        <p className="mt-1 mb-0 text-sm text-pier-muted">All services running on your cluster</p>
      </header>
      <div className="border border-pier-border rounded-pier-lg bg-pier-bg p-4 md:p-6">
        <AppsTable apps={MOCK_APPS} />
      </div>
    </div>
  );
}
