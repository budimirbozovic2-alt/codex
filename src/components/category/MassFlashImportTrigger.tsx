import BulkImportDialog from "./BulkImportDialog";

/**
 * Modular indirection for the "Masovni uvoz blic pitanja" flow.
 *
 * Currently delegates to the legacy `BulkImportDialog`. In the next iteration
 * this component will be replaced by a multi-step Wizard (analogous to the
 * Source Wizard). Consumers (e.g. `CardCreateMenu`) MUST import this trigger
 * — never `BulkImportDialog` directly — so the swap stays a 1-line change.
 */
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categoryId: string;
  bulkAddFlashCards: (
    pairs: { question: string; answer: string }[],
    categoryId: string,
    subcategoryId?: string,
  ) => void;
}

export default function MassFlashImportTrigger(props: Props) {
  return <BulkImportDialog {...props} />;
}
