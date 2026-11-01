import { useState } from "react";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { PierIcon } from "../../components/icons/PierIcon";

export interface EnvRow {
  id: string;
  key: string;
  value: string;
}

interface Props {
  rows: EnvRow[];
  errors: Record<string, string>;
  onRowChange: (row: EnvRow) => void;
  onRowRemove: (id: string) => void;
  onRowAdd: () => void;
  onClearRowError: (id: string) => void;
}

/**
 * Environment variable key/value rows with add/remove buttons.
 * Values are masked by default with a show/hide toggle.
 * Errors are displayed per row.
 */
export function EnvRows({
  rows,
  errors,
  onRowChange,
  onRowRemove,
  onRowAdd,
  onClearRowError,
}: Props) {
  const [visibleValues, setVisibleValues] = useState<Set<string>>(new Set());

  const toggleValueVisibility = (id: string) => {
    setVisibleValues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <label className="text-[13px] font-medium text-pier-fg">Environment</label>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-col gap-1">
            <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input
                value={row.key}
                onChange={(e) => {
                  onRowChange({ ...row, key: e.target.value });
                  if (errors[row.id]) {
                    onClearRowError(row.id);
                  }
                }}
                placeholder="KEY"
                invalid={Boolean(errors[row.id])}
                className="font-mono text-[12.5px]"
              />
            </div>
              <div className="flex-1">
                <div className="flex gap-1 items-center">
                  <Input
                    type={visibleValues.has(row.id) ? "text" : "password"}
                    value={row.value}
                    onChange={(e) => {
                      onRowChange({ ...row, value: e.target.value });
                      if (errors[row.id]) {
                        onClearRowError(row.id);
                      }
                    }}
                    placeholder="value"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-[12.5px]"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={
                      visibleValues.has(row.id) ? "Hide value" : "Show value"
                    }
                    onClick={() => toggleValueVisibility(row.id)}
                    className="shrink-0"
                    title={visibleValues.has(row.id) ? "Hide" : "Show"}
                  >
                    {visibleValues.has(row.id) ? "●" : "○"}
                  </Button>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove"
                onClick={() => onRowRemove(row.id)}
                className="shrink-0"
              >
                <PierIcon name="delete" size={16} />
              </Button>
            </div>
            {errors[row.id] && (
              <p className="text-[12px] text-pier-status-failed m-0">
                {errors[row.id]}
              </p>
            )}
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onRowAdd}
        className="text-[13px]"
      >
        <PierIcon name="add" size={14} />
        Add variable
      </Button>
      {errors[""] && (
        <p className="text-[12px] text-pier-status-failed m-0">{errors[""]}</p>
      )}
    </div>
  );
}
