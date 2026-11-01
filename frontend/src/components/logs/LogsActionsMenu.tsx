import { Menu } from "../ui/Menu";
import type { LogLine } from "../../hooks/useLogStream";
import { useToast } from "../ui/Toast";

interface LogsActionsMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: LogLine[];
  appName: string;
  selectedPod: string;
}

/**
 * Dropdown menu with Copy and Download actions.
 * Uses the shared Menu component with proper focus and Escape handling.
 */
export function LogsActionsMenu({
  open: _open,
  onOpenChange,
  lines,
  appName,
  selectedPod,
}: LogsActionsMenuProps) {
  const { push: toast } = useToast();

  const handleCopy = async () => {
    try {
      const text = lines.map((line) => line.text).join("\n");
      await navigator.clipboard.writeText(text);
      toast({ variant: "success", title: "Copied to clipboard" });
    } catch {
      toast({ variant: "error", title: "Failed to copy" });
    }
  };

  const handleDownload = () => {
    try {
      const text = lines.map((line) => line.text).join("\n");
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const now = new Date();
      const date = now.toISOString().slice(0, 19).replace(/:/g, "-");
      a.href = url;
      a.download = `${appName}-${selectedPod}-${date}.log`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ variant: "success", title: "Downloaded" });
    } catch {
      toast({ variant: "error", title: "Failed to download" });
    }
  };

  const options = [
    { id: "copy", label: "Copy" },
    { id: "download", label: "Download" },
  ];

  const handleSelect = (id: string) => {
    if (id === "copy") {
      handleCopy();
    } else if (id === "download") {
      handleDownload();
    }
    onOpenChange(false);
  };

  // Escape and outside click are handled by Menu component
  return (
    <Menu
      trigger={({ ref, onClick, onKeyDown, ...props }) => (
        <button
          ref={ref}
          onClick={onClick}
          onKeyDown={onKeyDown}
          aria-label="Log actions"
          className="h-7 px-2 text-pier-fg hover:bg-pier-surface rounded-pier text-[13px] font-medium"
          {...props}
        >
          ⋯
        </button>
      )}
      options={options}
      onSelect={handleSelect}
      className="relative"
    />
  );
}
