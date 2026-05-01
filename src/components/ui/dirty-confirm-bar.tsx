/**
 * `<DirtyConfirmBar>` — slides into a dialog footer when the user attempts to
 * close a dialog with unsaved changes. Three actions:
 *
 *   - Discard:  destructive — drops edits and closes
 *   - Keep editing:  cancels the close request, returns focus
 *   - Save & close:  runs the supplied save handler then closes (async-safe)
 *
 * Pair with `useDirtyDialog`. See that hook's docblock for wiring.
 */
import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  /** Discard unsaved changes and close. */
  onDiscard: () => void;
  /** Dismiss the bar, return focus to the dialog body. */
  onCancel: () => void;
  /**
   * Save and close. May be async; while pending, the bar shows a spinner and
   * disables all three buttons. Reject to keep the dialog open.
   */
  onSave: () => void | Promise<void>;
  /** Override default Bosnian copy if needed. */
  message?: string;
  discardLabel?: string;
  cancelLabel?: string;
  saveLabel?: string;
}

export default function DirtyConfirmBar({
  open,
  onDiscard,
  onCancel,
  onSave,
  message = "Imate nesačuvane izmjene.",
  discardLabel = "Odbaci izmjene",
  cancelLabel = "Nastavi uređivanje",
  saveLabel = "Sačuvaj i zatvori",
}: Props) {
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className="mt-4 flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 sm:flex-row sm:items-center sm:justify-between animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <div className="flex items-start gap-2 text-sm text-foreground">
        <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
        <span>{message}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDiscard}
          disabled={saving}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {discardLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving} autoFocus>
          {cancelLabel}
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving} className="gap-2">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
