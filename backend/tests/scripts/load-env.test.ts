import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { backendDir, runBash, withTempDir } from "../helpers/run-bash.js";

// Sources scripts/lib/load-env.sh in a clean bash and checks what it exports.

const loadEnv = path.join(backendDir, "scripts/lib/load-env.sh");

/** Writes `contents` to a temp .env, runs `body` after loading it, returns the result. */
function loadAndRun(contents: string, body: string, prelude = "") {
  return withTempDir((dir) => {
    const fixture = path.join(dir, ".env");
    fs.writeFileSync(fixture, contents);
    return runBash(`
      ${prelude}
      source "${loadEnv}"
      load_env_file "${fixture}"
      ${body}
    `);
  });
}

const cases: { name: string; file: string; key: string; want: string }[] = [
  { name: "basic parsing (splits on first =)", file: "A=abc==\n", key: "A", want: "abc==" },
  { name: "quoted value with spaces", file: 'B="hello  world"\n', key: "B", want: "hello  world" },
  { name: "apostrophe in unquoted value", file: "C=it's\n", key: "C", want: "it's" },
  { name: "single-quoted value", file: "D='single'\n", key: "D", want: "single" },
  { name: "backslash preserved", file: "E=a\\b\n", key: "E", want: "a\\b" },
  { name: "inline comment stripped", file: "F=val # comment\n", key: "F", want: "val" },
  { name: "hash inside quotes not stripped", file: 'G="has # hash"\n', key: "G", want: "has # hash" },
  { name: "handles export prefix", file: "export K=with_export_prefix\n", key: "K", want: "with_export_prefix" },
  { name: "last line without newline", file: "L=no_newline", key: "L", want: "no_newline" },
];

for (const c of cases) {
  test(`load-env.sh: ${c.name}`, () => {
    const result = loadAndRun(c.file, `printf '%s' "$${c.key}"`);
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.strictEqual(result.stdout, c.want);
  });
}

test("load-env.sh: skips blank lines and comments", () => {
  const file = "\n# This is a comment\nH=value1\n\n# Another comment\n  # indented comment\nI=value2\n";
  const result = loadAndRun(file, `printf '%s\\0%s' "$H" "$I"`);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  assert.deepStrictEqual(result.stdout.split("\0"), ["value1", "value2"]);
});

test("load-env.sh: rejects invalid keys", () => {
  const result = loadAndRun("123INVALID=value\n", "");
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /invalid key on line 1/);
});

test("load-env.sh: respects existing env vars", () => {
  const result = loadAndRun("J=from_file\n", `printf '%s' "$J"`, 'export J="from_env"');
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  assert.strictEqual(result.stdout, "from_env");
});

// Regression: `((line_num++))` returns status 1 when line_num is 0, which
// kills the shell under `set -e` on the very first line of the file.
for (const [name, file] of [
  ["first line is a variable", "A=1\nB=2\n"],
  ["first line is a comment", "# c\nA=1\nB=2\n"],
] as const) {
  test(`load-env.sh: survives set -euo pipefail (${name})`, () => {
    const result = loadAndRun(file, `printf '%s%s' "$A" "$B"`, "set -euo pipefail");
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.strictEqual(result.stdout, "12");
  });
}
