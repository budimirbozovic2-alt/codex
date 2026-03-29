

# Tier 3 Step 7: Fix Stale Duplicate Detection in ExportImportDialog

## Bug

In `ExportImportDialog.tsx` line 214:
```ts
const existingIds = new Set(cards.map(c => c.id));
```

The `cards` prop comes from React state and can be **stale** — the same class of bug fixed in `useCardExport.ts` (Steps 4-5). If the user creates/deletes cards after the dialog mounts but before clicking import, duplicate detection produces wrong counts, potentially leading to silent data loss on "keep" strategy or misleading conflict UI.

## Fix

### `src/components/ExportImportDialog.tsx` — line 214

Replace:
```ts
const existingIds = new Set(cards.map(c => c.id));
const duplicateCount = importedCards.filter(c => existingIds.has(c.id)).length;
```

With:
```ts
const freshCards = await db.cards.toArray();
const existingIds = new Set(freshCards.map(c => c.id));
const duplicateCount = importedCards.filter(c => existingIds.has(c.id)).length;
```

The `db` import is already present on line 4. This reads fresh IDs from IDB at validation time, consistent with the pattern used throughout the hardening pipeline.

## Scope

- One line changed, one line added
- No UI, validation, or conflict resolution logic changes
- Steps 1-6 untouched

