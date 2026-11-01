import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "../../lib/cn";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Button } from "./Button";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

/** Native dialog with focus trap and Escape to close. */
export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const triggerRef = useRef<HTMLElement | null>(null);

  useFocusTrap(ref as RefObject<HTMLElement | null>, open);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement;
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
      triggerRef.current?.focus();
    }
  }, [open]);

  const onCancel = useCallback(
    (e: Event) => {
      e.preventDefault();
      onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, [onCancel]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={cn(
        "m-auto max-w-md w-[calc(100%-2rem)] p-0 rounded-pier-lg border border-pier-border",
        "bg-pier-bg text-pier-fg shadow-lg backdrop:bg-black/40 open:flex open:flex-col",
        className,
      )}
      onClose={onClose}
    >
      <div className="px-5 py-4 border-b border-pier-border">
        <h2 id={titleId} className="m-0 text-[15px] font-semibold">
          {title}
        </h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}

interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
}: ConfirmProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {description && <p className="m-0 mb-4 text-sm text-pier-muted">{description}</p>}
      {children}
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" type="button" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          variant={variant === "danger" ? "danger" : "primary"}
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
