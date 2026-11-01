/** Dev-only route that throws to exercise the error boundary. */
export function BoomPage(): never {
  throw new Error("Intentional test error from /__boom (dev only)");
}
