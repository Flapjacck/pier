import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** Page-level title bar with optional description and action slot. */
export function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
      <div>
        <h1 className="m-0 text-[21px] font-bold text-pier-fg leading-tight">{title}</h1>
        {description && (
          <p className="mt-1 mb-0 text-sm text-pier-muted">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex gap-2 items-center">{actions}</div>
      )}
    </div>
  );
}
