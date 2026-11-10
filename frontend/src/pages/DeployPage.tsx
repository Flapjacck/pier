import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DeployWizard } from "./deploy/DeployWizard";

/**
 * Deploy page — form to deploy a new app.
 */
export function DeployPage() {
  const navigate = useNavigate();
  const { ingressDomain, tls } = useAuth();

  const handleCancel = () => {
    navigate("/apps");
  };

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="m-0 text-[21px] font-bold text-pier-fg">Deploy an app</h1>
        <p className="mt-1 mb-0 text-sm text-pier-muted">
          Build from a git repo or run a pre-built image on your cluster.
        </p>
      </header>

      <div className="border border-pier-border rounded-pier-lg bg-pier-bg p-6">
        <DeployWizard ingressDomain={ingressDomain} tls={tls} onCancel={handleCancel} />
      </div>
    </div>
  );
}
