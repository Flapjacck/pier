import { test } from "node:test";
import * as assert from "node:assert";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { backendDir, runBash, withTempDir } from "../helpers/run-bash.js";

// --render needs no cluster, docker, SSH or token, but lint_rendered uses the real kubectl.
const script = path.join(backendDir, "scripts/deploy-local.sh");
const hasKubectl = spawnSync("bash", ["-c", "command -v kubectl"], { encoding: "utf-8" }).stdout.trim() !== "";

test("deploy-local.sh --render: data PVC before the Deployment, mounted at /data with Recreate", { skip: hasKubectl ? false : "kubectl not installed" }, () => {
  withTempDir((dir) => {
    const out = path.join(dir, "out");
    const run = runBash(`"${script}" --render --out '${out}' t1`, {
      PATH: "/usr/local/bin:/usr/bin:/bin",
      HOME: dir,
      PIER_ENV_FILE: path.join(dir, "no-such.env"),
      PIER_INGRESS_DOMAIN: "192.0.2.10.nip.io",
    });
    assert.strictEqual(run.status, 0, run.stderr);

    const files = fs.readdirSync(out).sort();
    const at = (name: string) => files.findIndex((n) => n.endsWith(`-${name}.yaml`));
    assert.ok(at("service") < at("data-pvc"), `data-pvc out of order: ${files.join(", ")}`);
    assert.ok(at("data-pvc") >= 0 && at("data-pvc") < at("deployment"), `data-pvc out of order: ${files.join(", ")}`);

    const pvc = fs.readFileSync(path.join(out, files[at("data-pvc")] ?? ""), "utf-8");
    assert.match(pvc, /^ {2}name: pier-backend-data$/m);
    assert.match(pvc, /^ {2}namespace: default$/m);
    assert.match(pvc, /storageClassName: pier-local/);
    assert.match(pvc, /- ReadWriteOnce/);
    assert.match(pvc, /storage: 1Gi/);

    const deployment = fs.readFileSync(path.join(out, files[at("deployment")] ?? ""), "utf-8");
    assert.match(deployment, /strategy:\n\s+type: Recreate/);
    assert.match(deployment, /claimName: pier-backend-data/);
    assert.match(deployment, /- name: data\n\s+mountPath: \/data/);
    assert.match(deployment, /name: PIER_DB_PATH\n\s+value: "\/data\/pier\.db"/);
    assert.match(deployment, /name: PIER_TRUST_PROXY\n\s+value: "10\.42\.0\.0\/16"/);
  });
});
