import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "../../lib/cn";
import { Button } from "./Button";

export type ToastVariant = "success" | "error";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  push: (msg: Omit<ToastMessage, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DISMISS_MS = 5000;

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (paused) return;
    timerRef.current = window.setTimeout(() => onDismiss(toast.id), DISMISS_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [paused, toast.id, onDismiss]);

  return (
    <div
      role="status"
      className={cn(
        "flex gap-3 items-start p-3 rounded-pier-lg border shadow-md max-w-sm w-full",
        "bg-pier-bg border-pier-border",
        toast.variant === "error" && "border-pier-status-failed/40",
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="flex-1 min-w-0">
        <p className="m-0 text-[13px] font-semibold text-pier-fg">{toast.title}</p>
        {toast.description && (
          <p className="m-0 mt-0.5 text-[12px] text-pier-muted">{toast.description}</p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Dismiss notification"
        className="shrink-0 -mr-1 -mt-0.5"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </Button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((msg: Omit<ToastMessage, "id">) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...msg, id }]);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
