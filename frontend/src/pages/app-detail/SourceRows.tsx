import type { App } from "../../api/types";

const DT = "text-[13px] font-semibold text-pier-muted w-24 shrink-0";
const CODE = "font-mono text-[12.5px] text-pier-fg break-all";

/** Only https repos can be opened in a browser; ssh remotes stay as text. */
function repoHref(repo: string): string | undefined {
  return repo.startsWith("https://") ? repo.replace(/\.git$/, "") : undefined;
}

/**
 * Overview "built from" rows. With a git source the repo is the app's identity and
 * the built image ref is secondary (#83); without one, the image is all there is.
 */
export function SourceRows({ app }: { app: App }) {
  const source = app.source;
  if (!source) {
    return (
      <div className="flex gap-4">
        <dt className={DT}>Image</dt>
        <dd className="m-0"><code className={CODE} title={app.image}>{app.image}</code></dd>
      </div>
    );
  }
  const href = repoHref(source.repo);
  const method = source.method === "railpack" ? "Railpack" : `Dockerfile (${source.dockerfile})`;
  const image = source.lastImage ?? app.image;
  return (
    <>
      <div className="flex gap-4">
        <dt className={DT}>Repository</dt>
        <dd className="m-0 space-y-1">
          {href ? (
            <a href={href} target="_blank" rel="noreferrer" className={`${CODE} text-pier-accent hover:underline`}>{source.repo}</a>
          ) : (
            <code className={CODE}>{source.repo}</code>
          )}
          <p className="m-0 text-xs text-pier-muted">
            {source.branch}
            {source.folder !== "." && <> · <code>{source.folder}</code></>}
            {" · "}{method}
            {source.lastCommit && <> · <code title={source.lastCommit}>{source.lastCommit.slice(0, 7)}</code></>}
          </p>
        </dd>
      </div>
      {image && (
        <div className="flex gap-4">
          <dt className={DT}>Built image</dt>
          <dd className="m-0"><code className={`${CODE} text-pier-muted`} title={image}>{image}</code></dd>
        </div>
      )}
    </>
  );
}
