import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "../../lib/cn";

export interface MenuOption {
  id: string;
  label: string;
  disabled?: boolean;
}

interface Props {
  trigger: (props: {
    ref: RefObject<HTMLButtonElement | null>;
    onClick: () => void;
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
    "aria-expanded": boolean;
    "aria-controls": string;
    "aria-haspopup": "listbox";
  }) => ReactNode;
  options: MenuOption[];
  selectedId?: string;
  onSelect: (id: string) => void;
  className?: string;
}

/**
 * Keyboard-navigable listbox dropdown (arrow keys, Home/End, Enter, Escape).
 */
export function Menu({ trigger, options, selectedId, onSelect, className }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const enabledOptions = options.filter((o) => !o.disabled);

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const idx = Math.max(
      0,
      enabledOptions.findIndex((o) => o.id === selectedId),
    );
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [open, selectedId, enabledOptions]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!listRef.current?.contains(t) && !buttonRef.current?.contains(t)) close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);

  const onKeyDownList = (e: KeyboardEvent<HTMLUListElement>) => {
    const len = enabledOptions.length;
    if (len === 0) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % len);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + len) % len);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(len - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = enabledOptions[activeIndex];
      if (opt) {
        onSelect(opt.id);
        close();
      }
    }
  };

  const onKeyDownButton = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div className={cn("relative inline-flex", className)}>
      {trigger({
        ref: buttonRef,
        onClick: () => setOpen((v) => !v),
        onKeyDown: onKeyDownButton,
        "aria-expanded": open,
        "aria-controls": listId,
        "aria-haspopup": "listbox",
      })}
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          onKeyDown={onKeyDownList}
          className={cn(
            "absolute z-50 mt-1 min-w-[12rem] max-h-64 overflow-auto py-1",
            "rounded-pier-lg border border-pier-border bg-pier-bg shadow-lg",
            "focus-visible:outline-none",
          )}
        >
          {options.map((opt) => {
            const enabledIdx = enabledOptions.findIndex((e) => e.id === opt.id);
            const isActive = enabledIdx === activeIndex;
            const isSelected = opt.id === selectedId;
            return (
              <li
                key={opt.id}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled || undefined}
                className={cn(
                  "px-3 py-2 text-[13px] cursor-pointer",
                  opt.disabled && "opacity-45 pointer-events-none",
                  isActive && "bg-pier-surface-2",
                  isSelected && "font-semibold",
                )}
                onMouseEnter={() => {
                  if (!opt.disabled && enabledIdx >= 0) setActiveIndex(enabledIdx);
                }}
                onClick={() => {
                  if (opt.disabled) return;
                  onSelect(opt.id);
                  close();
                }}
              >
                {opt.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
