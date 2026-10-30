import { test } from "node:test";
import * as assert from "node:assert";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";

// Test load_env_file by sourcing the script and running it in a clean bash environment.
// Uses fixtures written to a temp directory.

// Get the backend directory (two levels up from this test file).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "../..");

test("load-env.sh: basic parsing", (_t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "load-env-test-"));

  try {
    const fixture = path.join(tmpDir, ".env");
    fs.writeFileSync(fixture, "A=abc==\n");

    const result = spawnSync(
      "bash",
      [
        "-c",
        `
          source "${backendDir}/scripts/lib/load-env.sh"
          load_env_file "${fixture}"
          printf '%s' "$A"
        `,
      ],
      {
        cwd: backendDir,
        env: {},
        encoding: "utf-8",
      }
    );

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.strictEqual(result.stdout, "abc==");
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("load-env.sh: quoted value with spaces", (_t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "load-env-test-"));

  try {
    const fixture = path.join(tmpDir, ".env");
    fs.writeFileSync(fixture, 'B="hello  world"\n');

    const result = spawnSync(
      "bash",
      [
        "-c",
        `
          source "${backendDir}/scripts/lib/load-env.sh"
          load_env_file "${fixture}"
          printf '%s' "$B"
        `,
      ],
      {
        cwd: backendDir,
        env: {},
        encoding: "utf-8",
      }
    );

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.strictEqual(result.stdout, "hello  world");
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("load-env.sh: apostrophe in unquoted value", (_t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "load-env-test-"));

  try {
    const fixture = path.join(tmpDir, ".env");
    fs.writeFileSync(fixture, "C=it's\n");

    const result = spawnSync(
      "bash",
      [
        "-c",
        `
          source "${backendDir}/scripts/lib/load-env.sh"
          load_env_file "${fixture}"
          printf '%s' "$C"
        `,
      ],
      {
        cwd: backendDir,
        env: {},
        encoding: "utf-8",
      }
    );

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.strictEqual(result.stdout, "it's");
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("load-env.sh: single-quoted value", (_t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "load-env-test-"));

  try {
    const fixture = path.join(tmpDir, ".env");
    fs.writeFileSync(fixture, "D='single'\n");

    const result = spawnSync(
      "bash",
      [
        "-c",
        `
          source "${backendDir}/scripts/lib/load-env.sh"
          load_env_file "${fixture}"
          printf '%s' "$D"
        `,
      ],
      {
        cwd: backendDir,
        env: {},
        encoding: "utf-8",
      }
    );

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.strictEqual(result.stdout, "single");
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("load-env.sh: backslash preserved", (_t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "load-env-test-"));

  try {
    const fixture = path.join(tmpDir, ".env");
    fs.writeFileSync(fixture, "E=a\\b\n");

    const result = spawnSync(
      "bash",
      [
        "-c",
        `
          source "${backendDir}/scripts/lib/load-env.sh"
          load_env_file "${fixture}"
          printf '%s' "$E"
        `,
      ],
      {
        cwd: backendDir,
        env: {},
        encoding: "utf-8",
      }
    );

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.strictEqual(result.stdout, "a\\b");
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("load-env.sh: inline comment stripped", (_t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "load-env-test-"));

  try {
    const fixture = path.join(tmpDir, ".env");
    fs.writeFileSync(fixture, "F=val # comment\n");

    const result = spawnSync(
      "bash",
      [
        "-c",
        `
          source "${backendDir}/scripts/lib/load-env.sh"
          load_env_file "${fixture}"
          printf '%s' "$F"
        `,
      ],
      {
        cwd: backendDir,
        env: {},
        encoding: "utf-8",
      }
    );

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.strictEqual(result.stdout, "val");
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("load-env.sh: hash inside quotes not stripped", (_t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "load-env-test-"));

  try {
    const fixture = path.join(tmpDir, ".env");
    fs.writeFileSync(fixture, 'G="has # hash"\n');

    const result = spawnSync(
      "bash",
      [
        "-c",
        `
          source "${backendDir}/scripts/lib/load-env.sh"
          load_env_file "${fixture}"
          printf '%s' "$G"
        `,
      ],
      {
        cwd: backendDir,
        env: {},
        encoding: "utf-8",
      }
    );

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.strictEqual(result.stdout, "has # hash");
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("load-env.sh: skips blank lines and comments", (_t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "load-env-test-"));

  try {
    const fixture = path.join(tmpDir, ".env");
    fs.writeFileSync(
      fixture,
      `
# This is a comment
H=value1

# Another comment
  # indented comment
I=value2
`
    );

    const result = spawnSync(
      "bash",
      [
        "-c",
        `
          source "${backendDir}/scripts/lib/load-env.sh"
          load_env_file "${fixture}"
          printf '%s\\0%s' "$H" "$I"
        `,
      ],
      {
        cwd: backendDir,
        env: {},
        encoding: "utf-8",
      }
    );

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    const [h, i] = result.stdout.split("\0");
    assert.strictEqual(h, "value1");
    assert.strictEqual(i, "value2");
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("load-env.sh: rejects invalid keys", (_t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "load-env-test-"));

  try {
    const fixture = path.join(tmpDir, ".env");
    fs.writeFileSync(fixture, "123INVALID=value\n");

    const result = spawnSync(
      "bash",
      [
        "-c",
        `
          source "${backendDir}/scripts/lib/load-env.sh"
          load_env_file "${fixture}"
        `,
      ],
      {
        cwd: backendDir,
        env: {},
        encoding: "utf-8",
      }
    );

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /invalid key on line 1/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("load-env.sh: respects existing env vars", (_t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "load-env-test-"));

  try {
    const fixture = path.join(tmpDir, ".env");
    fs.writeFileSync(fixture, "J=from_file\n");

    const result = spawnSync(
      "bash",
      [
        "-c",
        `
          source "${backendDir}/scripts/lib/load-env.sh"
          export J="from_env"
          load_env_file "${fixture}"
          printf '%s' "$J"
        `,
      ],
      {
        cwd: backendDir,
        env: {},
        encoding: "utf-8",
      }
    );

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.strictEqual(result.stdout, "from_env");
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("load-env.sh: handles export prefix", (_t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "load-env-test-"));

  try {
    const fixture = path.join(tmpDir, ".env");
    fs.writeFileSync(fixture, "export K=with_export_prefix\n");

    const result = spawnSync(
      "bash",
      [
        "-c",
        `
          source "${backendDir}/scripts/lib/load-env.sh"
          load_env_file "${fixture}"
          printf '%s' "$K"
        `,
      ],
      {
        cwd: backendDir,
        env: {},
        encoding: "utf-8",
      }
    );

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.strictEqual(result.stdout, "with_export_prefix");
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});
