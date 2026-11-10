import { useCallback, useState } from "react";
import { ApiError } from "../../api/errors";
import { createGitCredential, deleteGitCredential, listGitCredentials, updateGitCredential } from "../../api/sources";
import type { GitCredential } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { useToast } from "../../components/ui/Toast";
import { useApi } from "../../hooks/useApi";

const EMPTY = { name: "", username: "", token: "" };

/**
 * Git credentials for private repos (#83). Write-only like registries: the token is
 * sent once and never read back, so editing leaves it blank unless you replace it.
 */
export function GitCredentialsCard() {
  const { push: toast } = useToast();
  const fetcher = useCallback((signal: AbortSignal) => listGitCredentials({ signal }), []);
  const { data: credentials = [], loading, error, refetch } = useApi(fetcher, []);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string>();
  const [pending, setPending] = useState(false);

  const reset = () => { setForm(EMPTY); setEditing(undefined); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      if (editing) await updateGitCredential(editing, { username: form.username, ...(form.token ? { token: form.token } : {}) });
      else await createGitCredential(form);
      reset();
      toast({ variant: "success", title: "Git credential saved" });
      refetch();
    } catch (caught) {
      const err = caught instanceof ApiError ? caught : ApiError.network(caught);
      toast({ variant: "error", title: "Could not save git credential", description: err.message });
    } finally {
      setPending(false);
    }
  };

  const remove = async (credential: GitCredential) => {
    try {
      await deleteGitCredential(credential.name);
      toast({ variant: "success", title: "Git credential removed" });
      refetch();
    } catch (caught) {
      const err = caught instanceof ApiError ? caught : ApiError.network(caught);
      toast({ variant: "error", title: "Could not remove git credential", description: err.message });
    }
  };

  return (
    <section aria-label="Git credentials" className="border border-pier-border rounded-pier-lg bg-pier-bg p-5 mt-6">
      <h2 className="m-0 mb-1 text-[14px] font-semibold">Git credentials</h2>
      <p className="m-0 mb-4 text-xs text-pier-muted">For private repos. Use a read-only access token; it is stored as a cluster Secret and never shown again.</p>
      <form aria-label={editing ? `Edit ${editing}` : "Add git credential"} className="grid gap-3 sm:grid-cols-2 mb-5" onSubmit={(event) => void submit(event)}>
        <Field id="git-cred-name" label="Name"><Input value={form.name} readOnly={Boolean(editing)} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="github" /></Field>
        <Field id="git-cred-username" label="Username" hint="For GitHub tokens any non-empty value works"><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required placeholder="x-access-token" /></Field>
        <Field id="git-cred-token" label="Access token" hint={editing ? "Leave blank to keep the current token" : undefined}><Input type="password" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} required={!editing} autoComplete="new-password" /></Field>
        <div className="sm:col-span-2 flex gap-2">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Save credential"}</Button>
          {editing && <Button type="button" variant="secondary" onClick={reset}>Cancel</Button>}
        </div>
      </form>
      {loading && <p className="text-sm text-pier-muted">Loading…</p>}
      {error && <p className="text-sm text-pier-status-failed">Could not load git credentials. <button className="underline" onClick={refetch}>Retry</button></p>}
      {!loading && !error && credentials.length === 0 && <p className="text-sm text-pier-muted">No git credentials saved. Public repos do not need one.</p>}
      <ul className="m-0 p-0 list-none space-y-3">
        {credentials.map((credential) => (
          <li key={credential.name} className="flex items-center justify-between gap-3 border-b border-pier-border pb-3 last:border-0 last:pb-0">
            <span><strong className="text-sm">{credential.name}</strong><span className="block text-xs text-pier-muted">{credential.username}</span></span>
            <span className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => { setEditing(credential.name); setForm({ name: credential.name, username: credential.username, token: "" }); }}>Edit</Button>
              <Button size="sm" variant="danger" onClick={() => void remove(credential)}>Remove</Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
