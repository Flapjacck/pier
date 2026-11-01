import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";

interface DeleteConfirmDialogProps {
  open: boolean;
  appName: string;
  nameInput: string;
  onNameInputChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
}

/**
 * Delete confirmation dialog with name verification.
 * User must type the app name exactly to enable the Delete button.
 */
export function DeleteConfirmDialog({
  open,
  appName,
  nameInput,
  onNameInputChange,
  onClose,
  onConfirm,
  pending,
}: DeleteConfirmDialogProps) {
  const nameMatches = nameInput === appName;

  return (
    <Dialog open={open} onClose={onClose} title="Delete app?">
      <p className="m-0 mb-4 text-sm text-pier-muted">
        This will permanently delete <strong>{appName}</strong> and cannot be undone.
      </p>
      <p className="m-0 mb-4 text-sm text-pier-muted">
        To confirm, type the app name:
      </p>
      <Field
        id="delete-confirm-name"
        label="App name"
        className="mb-4"
      >
        <Input
          type="text"
          placeholder={appName}
          value={nameInput}
          onChange={(e) => onNameInputChange(e.currentTarget.value)}
          disabled={pending}
          autoFocus
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant="danger"
          type="button"
          onClick={onConfirm}
          disabled={!nameMatches || pending}
        >
          {pending ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </Dialog>
  );
}
