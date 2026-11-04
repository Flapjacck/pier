/** Poll `check` until it returns true or `timeoutMs` passes. */
export async function waitFor(check: () => boolean, timeoutMs = 2000, what = "condition"): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
