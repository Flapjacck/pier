import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DeployForm } from "./deploy/DeployForm";

/**
 * Deploy page — form to deploy a new app.
 */
export function DeployPage() {
  const navigate = useNavigate();
  const { ingressDomain } = useAuth();

  const handleCancel = () => {
    navigate("/apps");
  };

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="m-0 text-[21px] font-bold text-pier-fg">Deploy an app</h1>
        <p className="mt-1 mb-0 text-sm text-pier-muted">
          Create a new containerised app on your cluster.
        </p>
      </header>

      <div className="border border-pier-border rounded-pier-lg bg-pier-bg p-6">
        <DeployForm ingressDomain={ingressDomain} onCancel={handleCancel} />
      </div>
    </div>
  );
}
