import { useCallback, useState } from "react";
import { randomId } from "../../lib/id";
import type { EnvRow } from "./EnvRows";

/** Env var rows for the deploy wizard; ids are HTTP-safe (#83). */
export function useEnvRows() {
  const [rows, setRows] = useState<EnvRow[]>(() => [{ id: randomId(), key: "", value: "" }]);
  const change = useCallback((row: EnvRow) => setRows((prev) => prev.map((r) => (r.id === row.id ? row : r))), []);
  const remove = useCallback((id: string) => setRows((prev) => prev.filter((r) => r.id !== id)), []);
  const add = useCallback(() => setRows((prev) => [...prev, { id: randomId(), key: "", value: "" }]), []);
  return { rows, change, remove, add };
}
