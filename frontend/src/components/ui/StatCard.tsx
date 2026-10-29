interface Props {
  label: string;
  value: string;
  sub?: string;
}

/** Metric card used in the app detail hero row. */
export function StatCard({ label, value, sub }: Props) {
  return (
    <div className="bg-pier-surface border border-pier-border rounded-xl p-4 flex flex-col gap-1">
      <span className="text-[11px] font-semibold tracking-wider uppercase text-pier-muted">
        {label}
      </span>
      <span className="text-[22px] font-bold text-pier-fg leading-tight">{value}</span>
      {sub && <span className="text-[11.5px] text-pier-muted font-mono">{sub}</span>}
    </div>
  );
}
