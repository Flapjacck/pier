import type { VolumeHint } from "../../api/types";

const LABEL: Record<VolumeHint["confidence"], string> = { high: "Likely", medium: "Maybe", low: "Maybe" };
const SOURCE: Record<VolumeHint["source"], string> = {
  image: "image", compose: "compose file", fly: "fly.toml", dependency: "dependency", files: "repo files",
};

interface Props {
  hints: VolumeHint[];
  loading?: boolean;
  onAdd: (hint: VolumeHint) => void;
  onDismiss: (path: string) => void;
}

/**
 * Suggested volumes (#83 items 21–23). Suggest, never auto-create: Add only pre-fills
 * the volume row below, and nothing exists on the cluster until Deploy.
 */
export function SuggestedVolumes({ hints, loading = false, onAdd, onDismiss }: Props) {
  if (loading && hints.length === 0) {
    return <p className="text-xs text-pier-muted m-0">Checking the repo for data folders…</p>;
  }
  if (hints.length === 0) return null;
  return (
    <section aria-labelledby="suggested-volumes" className="border border-pier-border rounded-pier-lg p-4 space-y-3">
      <div>
        <h3 id="suggested-volumes" className="m-0 text-sm font-semibold text-pier-fg">Suggested volumes</h3>
        <p className="m-0 mt-1 text-xs text-pier-muted">Data written here is lost on redeploy unless it's on a volume.</p>
      </div>
      <ul className="m-0 p-0 list-none space-y-2">
        {hints.map((hint) => (
          <li key={hint.path} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-[13px] text-pier-fg">
                <code className="font-mono">{hint.path}</code>{" "}
                <span className="text-xs text-pier-muted">{LABEL[hint.confidence]} · {SOURCE[hint.source]}</span>
              </p>
              <p className="m-0 text-xs text-pier-muted">{hint.reason}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" className="text-xs text-pier-accent underline" onClick={() => onAdd(hint)}>
                Add volume
              </button>
              <button type="button" className="text-xs text-pier-muted" aria-label={`Dismiss ${hint.path}`} onClick={() => onDismiss(hint.path)}>
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
