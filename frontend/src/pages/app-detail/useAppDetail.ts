import { useContext } from "react";
import type { App } from "../../api/types";

interface AppDetailContextValue {
  app: App;
  refetch: () => void;
  setApp: (app: App) => void;
}

import { createContext } from "react";

export const AppDetailContext = createContext<AppDetailContextValue | null>(null);

/**
 * Hook to access the current app and refetch/update methods from the layout.
 * Use in any tab component to get the shared app state.
 */
export function useAppDetail(): AppDetailContextValue {
  const ctx = useContext(AppDetailContext);
  if (!ctx) {
    throw new Error("useAppDetail must be used within AppDetailLayout");
  }
  return ctx;
}
