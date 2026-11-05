import { useState, useCallback } from "react";
import type { DeployMode, FieldErrors } from "../../lib/deployValidation";

/** Image vs Dockerfile source fields for the deploy form. */
export function useSourceMode(clearError: (field: keyof FieldErrors) => void) {
  const [deployMode, setDeployModeState] = useState<DeployMode>("image");
  const [repo, setRepoState] = useState("");
  const [branch, setBranch] = useState("main");
  const [folder, setFolderState] = useState(".");
  const [dockerfile, setDockerfileState] = useState("Dockerfile");
  const [gitCredential, setGitCredential] = useState("");

  const setDeployMode = useCallback((value: DeployMode) => {
    setDeployModeState(value);
    clearError("image");
    clearError("repo");
  }, [clearError]);
  const setRepo = useCallback((value: string) => {
    setRepoState(value);
    clearError("repo");
  }, [clearError]);
  const setFolder = useCallback((value: string) => {
    setFolderState(value);
    clearError("folder");
  }, [clearError]);
  const setDockerfile = useCallback((value: string) => {
    setDockerfileState(value);
    clearError("dockerfile");
  }, [clearError]);

  return {
    deployMode, setDeployMode, repo, setRepo, branch, setBranch,
    folder, setFolder, dockerfile, setDockerfile, gitCredential, setGitCredential,
  };
}
