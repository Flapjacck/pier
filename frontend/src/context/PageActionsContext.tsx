import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface PageActionsContextValue {
  actions: ReactNode;
  setActions: (node: ReactNode) => void;
}

const PageActionsContext = createContext<PageActionsContextValue | null>(null);

export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  const value = useMemo(() => ({ actions, setActions }), [actions]);
  return (
    <PageActionsContext.Provider value={value}>{children}</PageActionsContext.Provider>
  );
}

export function usePageActionsSlot(): ReactNode {
  return useContext(PageActionsContext)?.actions ?? null;
}

/** Register header actions for the current page; cleared on unmount. */
export function useSetPageActions(actions: ReactNode) {
  const ctx = useContext(PageActionsContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setActions(actions);
    return () => ctx.setActions(null);
  }, [ctx, actions]);
}
