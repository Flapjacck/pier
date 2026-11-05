import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { redeployApp } from "../../api/client";
import { ApiError } from "../../api/errors";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { deployRedirectPath } from "../../lib/deploys";
import type { AppSource } from "../../api/types";

/** Rebuild from the saved git source and open the new deploy (#83). */
export function RedeployButton({ app, source }: { app: string; source: AppSource }) {
  const navigate = useNavigate();
  const { push: showToast } = useToast();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (pending) return;
    const ok = window.confirm(
      `Rebuild ${app} from ${source.repo} (${source.branch})?\nThis runs a Kaniko build and rolls out the new image.`,
    );
    if (!ok) return;
    setPending(true);
    try {
      const next = await redeployApp(app);
      showToast({ title: `${app} is rebuilding`, variant: "success" });
      navigate(deployRedirectPath(next), { replace: true });
    } catch (err) {
      const description = err instanceof ApiError ? err.message : "Redeploy failed";
      showToast({ title: "Redeploy failed", description, variant: "error" });
      setPending(false);
    }
  }

  return (
    <Button type="button" size="sm" variant="secondary" onClick={() => void onClick()} disabled={pending}>
      {pending ? "Building…" : "Redeploy"}
    </Button>
  );
}
