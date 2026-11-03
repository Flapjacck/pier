/**
 * Env row validation shared by the deploy form and the Settings tab.
 * Mirrors the backend env schema: ≤50 keys, ^[A-Za-z_][A-Za-z0-9_]*$, values ≤4096 chars.
 */

export type EnvRowValue = { id: string; key: string; value: string };

export type EnvValidation = {
  env: Record<string, string>;
  /** Keyed by row id; "" holds a form-level message (too many rows). */
  errors: Record<string, string>;
};

export function validateEnvRows(rows: EnvRowValue[]): EnvValidation {
  const env: Record<string, string> = {};
  const errors: Record<string, string> = {};
  const seen = new Set<string>();
  let count = 0;

  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key && !value) continue; // blank row
    count++;

    if (!key) {
      errors[row.id] = "Key is required";
    } else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      errors[row.id] =
        "Key must start with a letter or underscore, contain only alphanumeric characters and underscores";
    } else if (seen.has(key)) {
      errors[row.id] = "Duplicate key";
    } else if (value.length > 4096) {
      errors[row.id] = "Value must be ≤4096 characters";
    } else {
      seen.add(key);
      env[key] = value;
    }
  }

  // Row errors win over the count message (same precedence the deploy form always had).
  if (Object.keys(errors).length === 0 && count > 50) {
    return { env, errors: { "": "Maximum 50 environment variables" } };
  }
  return { env, errors };
}

/** Env map → editable rows (ids "1", "2", …), plus one blank row to type into. */
export function envToRows(env: Record<string, string> | undefined): EnvRowValue[] {
  const rows = Object.entries(env ?? {}).map(([key, value], i) => ({ id: String(i + 1), key, value }));
  return [...rows, { id: String(rows.length + 1), key: "", value: "" }];
}

export function sameEnv(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a);
  return ak.length === Object.keys(b).length && ak.every((k) => b[k] === a[k]);
}
