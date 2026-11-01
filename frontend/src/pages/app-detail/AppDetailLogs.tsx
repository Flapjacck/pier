/**
 * Logs tab: placeholder for live log viewer (#47).
 * TODO(#47): Implement EventSource-based live log streaming.
 */
export function AppDetailLogs() {
  return (
    <div className="p-6 border border-pier-border rounded-pier-lg bg-pier-surface text-center">
      <p className="text-sm text-pier-muted m-0">
        Live logs are coming soon{/* TODO(#47) */} (
        <code className="text-[11px] bg-pier-bg px-1 rounded-pier">#47</code>)
      </p>
    </div>
  );
}
