import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { createRegistry, deleteRegistry, listRegistries, testRegistry, updateRegistry } from "../api/registries";
import { ApiError } from "../api/errors";
import type { Registry } from "../api/types";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import { useApi } from "../hooks/useApi";

export function RegistriesPage() {
  const { push: toast } = useToast();
  const fetcher = useCallback((signal: AbortSignal) => listRegistries({ signal }), []);
  const { data: registries = [], loading, error, refetch } = useApi(fetcher, []);
  const [form, setForm] = useState({ name: "", host: "", username: "", password: "" });
  const [editing, setEditing] = useState<string>();
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      if (editing) await updateRegistry(editing, { host: form.host, username: form.username, ...(form.password ? { password: form.password } : {}) });
      else await createRegistry(form);
      setForm({ name: "", host: "", username: "", password: "" });
      setEditing(undefined);
      toast({ variant: "success", title: "Registry saved" });
      refetch();
    } catch (caught) {
      const err = caught instanceof ApiError ? caught : ApiError.network(caught);
      toast({ variant: "error", title: "Could not save registry", description: err.message });
    } finally {
      setPending(false);
    }
  };

  const action = async (registry: Registry, operation: "test" | "delete") => {
    try {
      if (operation === "test") {
        await testRegistry(registry.name);
        toast({ variant: "success", title: "Registry connection works" });
      } else {
        await deleteRegistry(registry.name);
        toast({ variant: "success", title: "Registry removed" });
        refetch();
      }
    } catch (caught) {
      const err = caught instanceof ApiError ? caught : ApiError.network(caught);
      toast({ variant: "error", title: operation === "test" ? "Registry test failed" : "Could not remove registry", description: err.message });
    }
  };

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="m-0 text-[21px] font-bold text-pier-fg">Registries</h1>
        <p className="mt-1 mb-0 text-sm text-pier-muted">Save credentials for private image registries.</p>
      </header>
      <div className="border border-pier-border rounded-pier-lg bg-pier-bg p-5 mb-6">
        <h2 className="m-0 mb-4 text-[14px] font-semibold">{editing ? `Edit ${editing}` : "Add registry"}</h2>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
          <Field id="registry-name" label="Name"><Input id="registry-name" value={form.name} readOnly={Boolean(editing)} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="ghcr" /></Field>
          <Field id="registry-host" label="Host" hint="For example ghcr.io"><Input id="registry-host" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} required placeholder="ghcr.io" /></Field>
          <Field id="registry-username" label="Username"><Input id="registry-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></Field>
          <Field id="registry-password" label="Token or password"><Input id="registry-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editing} autoComplete="new-password" /></Field>
          <div className="sm:col-span-2 flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Save registry"}</Button>{editing && <Button type="button" variant="secondary" onClick={() => { setEditing(undefined); setForm({ name: "", host: "", username: "", password: "" }); }}>Cancel</Button>}</div>
        </form>
      </div>
      <div className="border border-pier-border rounded-pier-lg bg-pier-bg p-5">
        <h2 className="m-0 mb-4 text-[14px] font-semibold">Saved registries</h2>
        {loading && <p className="text-sm text-pier-muted">Loading…</p>}
        {error && <p className="text-sm text-pier-status-failed">Could not load registries. <button className="underline" onClick={refetch}>Retry</button></p>}
        {!loading && !error && registries.length === 0 && <p className="text-sm text-pier-muted">No registries saved. Public images do not need credentials.</p>}
        <ul className="m-0 p-0 list-none space-y-3">
          {registries.map((registry) => (
            <li key={registry.name} className="flex items-center justify-between gap-3 border-b border-pier-border pb-3 last:border-0 last:pb-0">
              <span><strong className="text-sm">{registry.name}</strong><span className="block text-xs text-pier-muted">{registry.server} · {registry.username}</span></span>
              <span className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => void action(registry, "test")}>Test</Button><Button size="sm" variant="secondary" onClick={() => { setEditing(registry.name); setForm({ name: registry.name, host: registry.server, username: registry.username, password: "" }); }}>Edit</Button><Button size="sm" variant="danger" onClick={() => void action(registry, "delete")}>Remove</Button></span>
            </li>
          ))}
        </ul>
      </div>
      <Link to="/apps" className="sr-only">Back to apps</Link>
    </div>
  );
}
