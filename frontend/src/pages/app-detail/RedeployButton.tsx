import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { redeployApp } from "../../api/sources";
import { PierIcon } from "../../components/icons/PierIcon";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";

/**
 * Rebuild a git-sourced app from its branch head (#83). The build runs in the
 * background, so we jump straight to that deploy's page where its logs stream.
 */
export function RedeployButton({ app }: { app: string }) {
  const navigate = useNavigate();
  const { push: showToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function redeploy() {
    setBusy(true);
    try {
      const { deploymentId } = await redeployApp(app);
      navigate(`/apps/${encodeURIComponent(app)}/deployments/${deploymentId}`);
    } catch (err) {
      const description = err instanceof Error ? err.message : "Could not start the build.";
      showToast({ variant: "error", title: "Couldn't redeploy", description });
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => void redeploy()} disabled={busy} aria-busy={busy}>
      <PierIcon name="rollback" size={14} />
      {busy ? "Starting…" : "Redeploy"}
    </Button>
  );
}
