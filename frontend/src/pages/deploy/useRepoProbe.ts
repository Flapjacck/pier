import { useCallback, useRef, useState } from "react";
import { ApiError } from "../../api/errors";
import { probeGitRepo } from "../../api/sources";
import type { GitProbeBody, GitProbeResult, VolumeHint } from "../../api/types";

/**
 * Git probe state for the wizard (#83): one call on "Load repository" for branches,
 * folders and Dockerfiles, and a second once the build folder is known for volume hints.
 * Each call aborts the previous one so a stale answer never overwrites a newer choice.
 */
export function useRepoProbe() {
  const [result, setResult] = useState<GitProbeResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [hints, setHints] = useState<VolumeHint[]>([]);
  const [hintsLoading, setHintsLoading] = useState(false);
  const loadAbort = useRef<AbortController | null>(null);
  const hintAbort = useRef<AbortController | null>(null);

  const load = useCallback(async (body: GitProbeBody): Promise<GitProbeResult | undefined> => {
    loadAbort.current?.abort();
    const controller = new AbortController();
    loadAbort.current = controller;
    setLoading(true);
    setError(undefined);
    try {
      const next = await probeGitRepo(body, { signal: controller.signal });
      setResult(next);
      return next;
    } catch (caught) {
      if (controller.signal.aborted) return undefined;
      setResult(undefined);
      setError((caught instanceof ApiError ? caught : ApiError.network(caught)).message);
      return undefined;
    } finally {
      if (loadAbort.current === controller) setLoading(false);
    }
  }, []);

  /** Hints are best-effort: a failure just means no suggestions, never a blocked deploy. */
  const loadHints = useCallback(async (body: GitProbeBody) => {
    hintAbort.current?.abort();
    const controller = new AbortController();
    hintAbort.current = controller;
    setHintsLoading(true);
    try {
      const next = await probeGitRepo(body, { signal: controller.signal });
      setHints(next.volumeHints);
    } catch {
      if (!controller.signal.aborted) setHints([]);
    } finally {
      if (hintAbort.current === controller) setHintsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    loadAbort.current?.abort();
    hintAbort.current?.abort();
    setResult(undefined);
    setError(undefined);
    setHints([]);
    setLoading(false);
    setHintsLoading(false);
  }, []);

  return { result, loading, error, hints, hintsLoading, load, loadHints, reset };
}
