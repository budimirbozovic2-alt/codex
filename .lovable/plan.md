

# Diagnosis: "Save Button Disabled" After Category Deletion

## Root Cause

The "Sačuvaj izmjene" (Save) button in `SRSettingsPanel.tsx` (line 480) is controlled by:

```ts
disabled={!hasChanges}
```

Where `hasChanges` (line 66-68) compares:
- `local` (SR settings) vs `settings` prop
- `tts` state vs initial TTS ref
- `app` state vs initial app ref

**Category operations are NOT tracked by `hasChanges`.** Category add/rename/delete calls (`onAdd`, `onRename`, `onDelete`) fire **immediately** — they directly mutate IDB and React state through `useCategoryManagement`. They don't go through the Save button at all.

**The Save button is for SR algorithm parameters, TTS settings, and App settings only.** It is correctly disabled when none of those settings have changed. This is NOT a bug — the button is irrelevant to category operations.

## The Real Problem

The user's junk categories **are being deleted immediately** when they click the trash icon. The confusion is that the Save button stays grey, making the user *think* the delete didn't work. But it did.

If categories are truly not disappearing, then the issue is in `deleteCategory` (line 81-121 of `useCategoryManagement.ts`): it filters by **name** string (`prev.filter(c => c !== name)`), but categories in the v7 schema are `CategoryRecord` objects with UUID `.id` fields. The `categories` array passed to CategoryManager is `string[]` (names), so the name-based filter works for the UI list — but the **IDB `categories` table is never cleaned up** because `deleteCategory` never calls `db.categories.delete(uuid)`.

## The Fix — 2 Parts

### Part A: Add IDB Category Deletion to `deleteCategory`

In `src/hooks/useCategoryManagement.ts`, the `deleteCategory` function:
1. Filters the name from the React state array (line 83) — works for UI
2. Reassigns cards to fallback category (lines 84-101) — works
3. Reassigns sources (lines 110-118) — works
4. **Never deletes the CategoryRecord from IDB** — BUG

Fix: Look up the category's UUID from `getCategoryRecords()`, then call `db.categories.delete(uuid)` to remove it from IDB. This ensures the category doesn't reappear after page refresh.

### Part B: Add Cascade Delete Option for Phantom Cards

Currently `deleteCategory` reassigns orphaned cards to the first remaining category. For junk categories with 500 phantom cards, this pollutes the fallback category. Add an optional `cascade: boolean` parameter: when true, **delete** the cards instead of reassigning them.

In `CategoryManager.tsx`, when the card count is high (e.g., >10), show a confirmation dialog asking whether to move cards or delete them.

### File Changes

**`src/hooks/useCategoryManagement.ts`** — In `deleteCategory`:
- Look up UUID: `const record = getCategoryRecords().find(r => r.name === name)`
- After all reassignment/cleanup: `if (record) db.categories.delete(record.id)`
- Add optional `purgeCards` parameter that deletes cards instead of reassigning

**`src/components/CategoryManager.tsx`** — In the delete button handler:
- If `cardCountByCategory[cat] > 0`, show a confirm dialog with two options: "Prebaci kartice" (move) vs "Obriši sve" (purge)
- Pass the purge flag to `onDelete`

**`src/contexts/AppContext.tsx`** — Update `deleteCategory` type signature if needed to accept the optional purge flag

## Scope
- SR settings, export/import, FSRS math: untouched
- Save button behavior: unchanged (it correctly tracks only SR/TTS/App settings)
- ~30 lines changed across 2-3 files

