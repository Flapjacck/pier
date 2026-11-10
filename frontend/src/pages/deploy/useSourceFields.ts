import { useCallback, useMemo, useState } from "react";
import type { BuildMethod, SourceBody } from "../../api/types";
import { useRepoProbe } from "./useRepoProbe";
import type { SourceKind } from "./wizardSteps";

/** Dockerfiles the probe found under `folder`, as paths relative to it (that's what builds use). */
export function dockerfilesIn(all: string[], folder: string): string[] {
  if (folder === ".") return all;
  const prefix = `${folder.replace(/\/+$/, "")}/`;
  return all.filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length));
}

/**
 * Where the app comes from (#83): a git repo (default) built with Railpack (default) or a
 * Dockerfile, or a pre-built image. Only the credential *name* is held here, never a token.
 */
export function useSourceFields() {
  const [kind, setKindState] = useState<SourceKind>("repo");
  const [repo, setRepoState] = useState("");
  const [gitCredential, setGitCredentialState] = useState("");
  const [branch, setBranch] = useState("");
  const [folder, setFolderState] = useState(".");
  const [method, setMethod] = useState<BuildMethod>("railpack");
  const [dockerfile, setDockerfile] = useState("Dockerfile");
  const probe = useRepoProbe();
  const { reset } = probe;

  // A different repo or credential invalidates everything the probe told us.
  const setRepo = useCallback((value: string) => { setRepoState(value); reset(); }, [reset]);
  const setGitCredential = useCallback((value: string) => { setGitCredentialState(value); reset(); }, [reset]);
  const setKind = useCallback((value: SourceKind) => setKindState(value), []);

  const setFolder = useCallback((value: string) => {
    setFolderState(value);
    setDockerfile((current) => {
      const found = dockerfilesIn(probe.result?.dockerfiles ?? [], value);
      return found.includes(current) ? current : (found[0] ?? "Dockerfile");
    });
  }, [probe.result]);

  const loadRepository = useCallback(async () => {
    const result = await probe.load({ repo: repo.trim(), ...(gitCredential ? { gitCredential } : {}) });
    if (!result) return;
    setBranch((current) => (result.branches.includes(current) ? current : result.defaultBranch));
    setFolderState((current) => (result.folders.includes(current) ? current : "."));
    setDockerfile((current) => {
      const root = dockerfilesIn(result.dockerfiles, ".");
      return root.includes(current) ? current : (root.find((p) => !p.includes("/")) ?? root[0] ?? "Dockerfile");
    });
  }, [probe, repo, gitCredential]);

  const body = useMemo((): SourceBody | undefined => {
    if (kind !== "repo") return undefined;
    return {
      method,
      repo,
      ...(branch ? { branch } : {}),
      folder,
      ...(method === "dockerfile" ? { dockerfile } : {}),
      ...(gitCredential ? { gitCredential } : {}),
    };
  }, [kind, method, repo, branch, folder, dockerfile, gitCredential]);

  /** Re-probe with the build choices so the Runtime step can suggest volumes. */
  const { loadHints } = probe;
  const refreshHints = useCallback(() => {
    if (!body || !probe.result) return;
    void loadHints({ repo: body.repo.trim(), branch: body.branch, folder, method, ...(method === "dockerfile" ? { dockerfile } : {}), ...(gitCredential ? { gitCredential } : {}) });
  }, [body, probe.result, loadHints, folder, method, dockerfile, gitCredential]);

  return {
    kind, setKind,
    repo, setRepo,
    gitCredential, setGitCredential,
    branch, setBranch,
    folder, setFolder,
    method, setMethod,
    dockerfile, setDockerfile,
    probe, loadRepository, refreshHints,
    body,
  };
}

export type SourceFields = ReturnType<typeof useSourceFields>;
