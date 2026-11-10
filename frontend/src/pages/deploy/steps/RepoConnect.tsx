import { useCallback } from "react";
import { Button } from "../../../components/ui/Button";
import { Field } from "../../../components/ui/Field";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { listGitCredentials } from "../../../api/sources";
import { useApi } from "../../../hooks/useApi";
import type { DeployFormState } from "../useDeployForm";

/** Git path: repo URL, optional credential (by name only), then Load repository for branches. */
export function RepoConnect({ form }: { form: DeployFormState }) {
  const { source } = form;
  const fetcher = useCallback((signal: AbortSignal) => listGitCredentials({ signal }), []);
  // Credentials are optional; if the list fails (e.g. build namespace not applied) public repos still work.
  const { data: credentials = [] } = useApi(fetcher, []);
  const loaded = source.probe.result;
  return (
    <div className="space-y-4">
      <div>
        <Field id="deploy-repo" label="Repository" hint="https://github.com/owner/repo or git@github.com:owner/repo" error={form.errors.repo ?? source.probe.error}>
          <Input value={source.repo} onChange={(e) => form.setRepo(e.target.value)} placeholder="https://github.com/owner/repo" className="font-mono text-[12.5px]" invalid={Boolean(form.errors.repo ?? source.probe.error)} />
        </Field>
        <div className="flex items-center gap-2 mt-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => { form.clearError("repo"); void source.loadRepository(); }} disabled={source.probe.loading || !source.repo.trim()}>
              {source.probe.loading ? "Loading…" : loaded ? "Reload repository" : "Load repository"}
            </Button>
            {loaded && <span className="text-xs text-pier-muted">{loaded.branches.length} branches · {loaded.folders.length} folders</span>}
        </div>
      </div>
      {credentials.length > 0 && (
        <Field id="deploy-git-credential" label="Git credential" hint="For private repos. The token is never shown again.">
          <Select id="deploy-git-credential" value={source.gitCredential} onChange={(e) => source.setGitCredential(e.target.value)}>
            <option value="">None (public repo)</option>
            {credentials.map((item) => <option key={item.name} value={item.name}>{item.name} ({item.username})</option>)}
          </Select>
        </Field>
      )}
      {loaded && (
        <Field id="deploy-branch" label="Branch" hint={`Default branch is ${loaded.defaultBranch}. Redeploy builds its latest commit.`}>
          <Select id="deploy-branch" value={source.branch} onChange={(e) => source.setBranch(e.target.value)}>
            {loaded.branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </Field>
      )}
    </div>
  );
}
