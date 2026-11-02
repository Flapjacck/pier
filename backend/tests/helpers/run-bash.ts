import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to the backend package (tests/helpers -> backend). */
export const backendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/** Runs `fn` with a fresh temp directory and removes it afterwards. */
export function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pier-test-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Runs a bash script with an empty environment (plus `env`) from backendDir. */
export function runBash(
  script: string,
  env: NodeJS.ProcessEnv = {},
): SpawnSyncReturns<string> {
  return spawnSync("bash", ["-c", script], {
    cwd: backendDir,
    env,
    encoding: "utf-8",
  });
}
