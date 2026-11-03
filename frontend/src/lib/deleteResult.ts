import type { DeleteAppResult } from "../api/types";

/** Warning toast text when deleting an app's volumes left data behind, or undefined when cleanup was clean. */
export function deleteVolumesWarning(result: DeleteAppResult): string | undefined {
  if (result.volumeErrors.length > 0) return result.volumeErrors.join("; ");
  if (result.dataRetained) return "The volume's data was kept on the node; see the k8s README for manual cleanup.";
  return undefined;
}
