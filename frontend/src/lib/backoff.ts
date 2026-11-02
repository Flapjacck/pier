/**
 * Calculate exponential backoff delay with jitter.
 * Base doubles from 1s up to 30s cap with ±10% jitter.
 * @param attempt - Attempt number (0-indexed)
 * @param random - Random number generator (0 to 1); defaults to Math.random
 * @returns Delay in milliseconds
 */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(1000 * Math.pow(2, attempt), 30000);
  const jitter = base * 0.2 * (random() - 0.5);
  return base + jitter;
}
