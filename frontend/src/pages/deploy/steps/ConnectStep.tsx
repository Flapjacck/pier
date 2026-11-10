import type { DeployFormState } from "../useDeployForm";
import { ImageConnect } from "./ImageConnect";
import { RepoConnect } from "./RepoConnect";

export function ConnectStep({ form }: { form: DeployFormState }) {
  return form.kind === "image" ? <ImageConnect form={form} /> : <RepoConnect form={form} />;
}
