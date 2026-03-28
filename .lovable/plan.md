

# Bulk Card Import (Masovni Import) — BulkImportDialog

## What
Add a "Masovni Import" button to the CardViewMode toolbar that opens a dialog for pasting `Question;Answer` pairs (one per line). Cards are parsed, previewed, and saved as flash cards scoped to the current `categoryId`.

## New File

**`src/components/category/BulkImportDialog.tsx`**
- Dialog with imperial-styled header ("Masovni import blic pitanja")
- Large `<Textarea>` for pasting raw text
- Format hint: `Pitanje;Odgovor` (one pair per line, semicolon separator)
- "Analiziraj" button that parses text, splits by newline, splits each line by `;`
- Skips blank lines and lines without a separator
- Shows preview: count of detected cards + first 5 as samples
- "Uvezi {N} kartica" confirm button calls `addFlashCard` for each pair with the locked `categoryId`
- Props: `open`, `onOpenChange`, `categoryId`, `addFlashCard`

## Modified File

**`src/components/category/CardViewMode.tsx`**
- Import `BulkImportDialog`
- Add `bulkImportOpen` state
- Add "Masovni Import" button with `<Upload>` icon next to "Nova kartica" in the toolbar (line ~259)
- Render `<BulkImportDialog>` at end of component

## Technical Details
- Parser: `line.split(";")` with index 0 = question, rest joined = answer (handles answers containing semicolons)
- Validation: skip lines where question or answer is empty after trim
- Toast on success: `Uspješno uvezeno {N} blic pitanja`
- No changes needed to CardOrgMode (it's for organization, not card creation)

