import { test } from "node:test";
import * as assert from "node:assert";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { backendDir, runBash, withTempDir } from "../helpers/run-bash.js";

// Runs scripts/deploy-local.sh against shim kubectl/docker/ssh binaries that
// log their argv, so we can prove the token never lands in any argv and that
// --render needs no cluster, SSH, docker or token. The kubectl shim hands
// offline subcommands (create --dry-run=client, label --local, kustomize) to
// the real kubectl and fakes the rest.

const script = path.join(backendDir, "scripts/deploy-local.sh");
const FAKE_TOKEN = "fake-token-6d1f0c2a9b8e";
const realKubectl = spawnSync("bash", ["-c", "command -v kubectl"], {
  encoding: "utf-8",
}).stdout.trim();

const SHIM = `#!/usr/bin/env bash
printf '%s\\n' "$(basename "$0") $*" >>"$SHIM_LOG"
case "$(basename "$0")" in
  kubectl)
    case " $* " in
      *" apply "*) cat >>"$SHIM_LOG.stdin"; exit 0 ;;
      *" get crd "*) [[ -z "\${SHIM_NO_CRDS:-}" ]]; exit $? ;;
      *" get "* | *" rollout "*) exit 0 ;;
    esac
    exec "$REAL_KUBECTL" "$@"
    ;;
  docker) [[ "$1" == save ]] && echo fake-image-tar; exit 0 ;;
  ssh) cat >/dev/null; exit 0 ;;
esac
exit 1
`;

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  argv: string;
  applied: string;
}

/** Runs deploy-local.sh with shims first on PATH and a minimal, explicit env. */
function deploy(args: string[], env: Record<string, string>, dir: string): Run {
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  for (const name of ["kubectl", "docker", "ssh"]) {
    fs.writeFileSync(path.join(bin, name), SHIM, { mode: 0o755 });
  }
  const log = path.join(dir, "shim.log");
  fs.writeFileSync(log, "");
  const quoted = args.map((a) => `'${a}'`).join(" ");
  const result = runBash(`"${script}" ${quoted}`, {
    PATH: `${bin}:/usr/local/bin:/usr/bin:/bin`,
    HOME: dir,
    SHIM_LOG: log,
    REAL_KUBECTL: realKubectl,
    PIER_ENV_FILE: path.join(dir, "no-such.env"),
    ...env,
  });
  const read = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, "utf-8") : "");
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    argv: read(log),
    applied: read(`${log}.stdin`),
  };
}

const skip = realKubectl === "" ? "kubectl not installed" : false;
const base64Token = Buffer.from(FAKE_TOKEN).toString("base64");

test("deploy-local.sh --render: offline, no token, nothing left unrendered", { skip }, () => {
  withTempDir((dir) => {
    const out = path.join(dir, "out");
    const run = deploy(["--render", "--out", out, "t1"], {
      PIER_INGRESS_DOMAIN: "192.0.2.10.nip.io",
    }, dir);
    assert.strictEqual(run.status, 0, run.stderr);

    const files = fs.readdirSync(out).sort();
    assert.deepStrictEqual(files.slice(0, 5), [
      "000-namespace.yaml",
      "010-namespace-system.yaml",
      "020-rbac.yaml",
      "030-rbac-apps.yaml",
      "040-rbac-builds.yaml",
    ]);
    // Build plumbing (#83): registry and BuildKit come after the StorageClass they use.
    const order = (n: string) => files.findIndex((f) => f.endsWith(`-${n}.yaml`));
    assert.ok(order("storage") < order("registry") && order("registry") < order("buildkit"));
    for (const f of ["secret", "deployment", "ingress"]) {
      assert.ok(files.some((n) => n.endsWith(`-${f}.yaml`)), `missing ${f}`);
    }
    const all = files.map((f) => fs.readFileSync(path.join(out, f), "utf-8")).join("\n");
    assert.doesNotMatch(all, /__[A-Z0-9_]+__/);
    assert.match(all, /image: pier-backend:t1/);
    assert.match(all, /host: pier\.192\.0\.2\.10\.nip\.io/);
    assert.match(all, new RegExp(Buffer.from("REDACTED").toString("base64")));
    // TLS is opt-in: no issuer, no tls manifest and no TLS on the dashboard.
    assert.ok(!files.some((n) => n.endsWith("-tls.yaml")), "tls rendered without an issuer");
    assert.doesNotMatch(all, /# tls-only$|cert-manager\.io\/cluster-issuer|secretName: pier-backend-tls/m);

    // Never touched the cluster, docker or ssh.
    assert.doesNotMatch(run.argv, /^(docker|ssh) /m);
    assert.doesNotMatch(run.argv, /kubectl .*\b(get|apply|rollout)\b/);
  });
});

test("deploy-local.sh --render: a set token never reaches the files", { skip }, () => {
  withTempDir((dir) => {
    const out = path.join(dir, "out");
    const run = deploy(["--render", "--out", out, "t2"], { PIER_API_TOKEN: FAKE_TOKEN }, dir);
    assert.strictEqual(run.status, 0, run.stderr);
    const all = fs.readdirSync(out).map((f) => fs.readFileSync(path.join(out, f), "utf-8")).join("\n");
    assert.ok(!all.includes(FAKE_TOKEN) && !all.includes(base64Token));
    assert.ok(!fs.readdirSync(out).some((f) => f.includes("ingress")), "no host, no ingress");
  });
});

test("deploy-local.sh: full deploy keeps the token out of every argv", { skip }, () => {
  withTempDir((dir) => {
    const run = deploy(["t3"], {
      PIER_API_TOKEN: FAKE_TOKEN,
      K3S_HOST: "192.0.2.10",
      K3S_SSH_USER: "pier",
    }, dir);
    assert.strictEqual(run.status, 0, run.stderr);
    assert.ok(!run.argv.includes(FAKE_TOKEN), "token found in an argv");
    assert.ok(!run.argv.includes(base64Token), "encoded token found in an argv");
    assert.match(run.argv, /^docker build /m);
    assert.match(run.argv, /^ssh pier@192\.0\.2\.10 sudo k3s ctr images import -$/m);
    assert.match(run.argv, /kubectl -n default rollout status deploy\/pier-backend/);
    // The Secret itself still carries the token, via stdin.
    assert.match(run.applied, new RegExp(`PIER_API_TOKEN: ${base64Token}`));
  });
});

test("deploy-local.sh: --dry-run skips docker and ssh", { skip }, () => {
  withTempDir((dir) => {
    const run = deploy(["--dry-run", "t4"], { PIER_API_TOKEN: FAKE_TOKEN }, dir);
    assert.strictEqual(run.status, 0, run.stderr);
    assert.doesNotMatch(run.argv, /^(docker|ssh) /m);
    assert.match(run.argv, /kubectl apply --dry-run=server -f -/);
  });
});

test("deploy-local.sh --render: PIER_TLS_ISSUER adds the CA issuer and dashboard TLS", { skip }, () => {
  withTempDir((dir) => {
    const out = path.join(dir, "out");
    const run = deploy(["--render", "--out", out, "t6"], {
      PIER_INGRESS_DOMAIN: "192.0.2.10.nip.io",
      PIER_TLS_ISSUER: "pier-ca",
    }, dir);
    assert.strictEqual(run.status, 0, run.stderr);
    const files = fs.readdirSync(out).sort();
    const tlsAt = files.findIndex((n) => n.endsWith("-tls.yaml"));
    const serviceAt = files.findIndex((n) => n.endsWith("-service.yaml"));
    assert.ok(tlsAt > 0 && tlsAt < serviceAt, `tls out of order: ${files.join(", ")}`);
    const read = (suffix: string) =>
      fs.readFileSync(path.join(out, files.find((n) => n.endsWith(suffix)) ?? ""), "utf-8");
    const ingress = read("-ingress.yaml");
    assert.match(ingress, /^ {4}cert-manager\.io\/cluster-issuer: pier-ca$/m);
    assert.match(ingress, /router\.middlewares: default-pier-https-redirect@kubernetescrd$/m);
    assert.match(ingress, /^ {6}secretName: pier-backend-tls$/m);
    assert.doesNotMatch(ingress, /# tls-only$/m);
    assert.match(read("-deployment.yaml"), /name: PIER_TLS_ISSUER\n\s+value: "pier-ca"/);
    assert.match(read("-tls.yaml"), /name: pier-ca/);
  });
});

test("deploy-local.sh --render: re-rendering into the same dir replaces old files", { skip }, () => {
  withTempDir((dir) => {
    const out = path.join(dir, "out");
    const env = { PIER_INGRESS_DOMAIN: "192.0.2.10.nip.io" };
    const first = deploy(["--render", "--out", out, "t8"], { ...env, PIER_TLS_ISSUER: "pier-ca" }, dir);
    assert.strictEqual(first.status, 0, first.stderr);
    assert.ok(fs.readdirSync(out).some((n) => n.endsWith("-tls.yaml")));
    fs.writeFileSync(path.join(out, "05-old.yaml"), "kind: ConfigMap\n");

    // deploy() makes its shim dir per call, so each run gets its own temp dir.
    withTempDir((dir2) => {
      const again = deploy(["--render", "--out", out, "t8"], env, dir2);
      assert.strictEqual(again.status, 0, again.stderr);
    });
    withTempDir((dir3) => {
      const fresh = path.join(dir3, "fresh");
      const run = deploy(["--render", "--out", fresh, "t8"], env, dir3);
      assert.strictEqual(run.status, 0, run.stderr);
      assert.deepStrictEqual(fs.readdirSync(out).sort(), fs.readdirSync(fresh).sort());
    });
  });
});

test("deploy-local.sh: PIER_TLS_ISSUER without cert-manager fails before applying", { skip }, () => {
  withTempDir((dir) => {
    const run = deploy(["--dry-run", "t7"], {
      PIER_API_TOKEN: FAKE_TOKEN,
      PIER_TLS_ISSUER: "pier-ca",
      SHIM_NO_CRDS: "1",
    }, dir);
    assert.strictEqual(run.status, 1);
    assert.match(run.stderr, /cert-manager isn't installed.*install-cert-manager\.sh/);
    assert.doesNotMatch(run.argv, /kubectl apply/);
  });
});

for (const [name, args, err] of [
  ["unknown flag", ["--bogus"], /unknown flag --bogus/],
  ["--render with --dry-run", ["--render", "--dry-run"], /only one of --dry-run and --render/],
  ["--out without --render", ["--out", "x"], /--out only works with --render/],
  ["bad TAG", ["--render", "a|b"], /TAG "a\|b" may only use/],
  ["bad PIER_TLS_ISSUER", ["--render"], /TLS_ISSUER "Pier_CA" contains invalid characters/],
] as const) {
  test(`deploy-local.sh: rejects ${name}`, () => {
    withTempDir((dir) => {
      const env: Record<string, string> = name.includes("TLS") ? { PIER_TLS_ISSUER: "Pier_CA" } : {};
      const run = deploy([...args], env, dir);
      assert.strictEqual(run.status, 1);
      assert.match(run.stderr, err);
    });
  });
}

test("deploy-local.sh: deploy without K3S_HOST fails before touching anything", () => {
  withTempDir((dir) => {
    const run = deploy(["t5"], { PIER_API_TOKEN: FAKE_TOKEN }, dir);
    assert.strictEqual(run.status, 1);
    assert.match(run.stderr, /K3S_HOST not set/);
    assert.strictEqual(run.argv, "");
  });
});
