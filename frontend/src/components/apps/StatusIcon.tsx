import type { ReactNode } from "react";
import type { AppStatus } from "../../api/types";

const iconProps = {
  viewBox: "0 0 24 24",
  width: 13,
  height: 13,
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
  className: "block shrink-0",
};

const STATUS_ICONS: Record<AppStatus, ReactNode> = {
  running: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.8 2.8L16.2 9.5" />
    </svg>
  ),
  building: (
    <svg {...iconProps}>
      <path d="M12 3a9 9 0 1 1-9 9" />
      <path d="M8.5 13.5h7v3h-7z" />
      <path d="M10 10.5h4" />
    </svg>
  ),
  failed: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  ),
  stopped: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <rect x="9" y="9" width="6" height="6" rx="0.5" />
    </svg>
  ),
};

interface Props {
  status: AppStatus;
}

/** Inline deploy status glyph so `currentColor` follows status text tokens. */
export function StatusIcon({ status }: Props) {
  return STATUS_ICONS[status];
}
