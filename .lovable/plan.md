

# Tier 3 Step 5: Subcategories Import Deduplication

## Bug

When importing a v7+ backup, the import runs **two conflicting writes** for subcategories:

1. **Line 119**: `db.categories.bulkPut(catRecords)` — writes full CategoryRecords with embedded `.subcategories` arrays (correct, UUID-preserving)
2. **Line 142**: `setSubcategories(() => data.subcategories)` — triggers `useCards.ts` line 117 which **re-reads** IDB categories and overwrites `.subcategories` using name-based key lookup from the separate `data.subcategories` Record

This means the embedded subcategories from CategoryRecords get **overwritten** by the separate `data.subcategories` field. If these are out of sync (which they can be in older exports), subcategories get corrupted.

Additionally, the separate `data.subcategories` field is keyed by **category name**, not UUID — a leftover from the legacy architecture.

## Fix

### File 1: `src/hooks/useCardImport.ts`

**Skip the separate subcategories write when CategoryRecords were imported (they already contain subcategories).**

After the category import block (line 136), wrap the subcategories block in a guard:

```
// Only process separate subcategories field for legacy imports
// v7+ CategoryRecords already carry embedded subcategories
if (isRecordFormat) {
  // Sync React subcategories state from the just-written CategoryRecords
  const subMap: Record<string, string[]> = {};
  freshRecords.forEach(r => {
    if (r.subcategories?.length > 0) subMap[r.name] = r.subcategories;
  });
  setSubcategories(() => subMap);
} else {
  // Legacy path: use separate subcategories field
  // (existing lines 137-151 unchanged)
}
```

This requires hoisting `isRecordFormat` and `freshRecords` variables so they're accessible in the subcategories block.

### File 2: `src/hooks/useCardExport.ts`

**Stop exporting redundant subcategories field for v7+ exports.**

Since CategoryRecords already contain `.subcategories`, the separate `subcategories` field in the JSON payload is redundant. However, for backward compatibility with older import logic, we keep it but derive it from the CategoryRecords:

In both `exportTemplate` and `exportData`, replace the `subcategories` prop reference with a derived map:
```
const subMap: Record<string, string[]> = {};
catRecords.forEach(r => {
  if (r.subcategories?.length > 0) subMap[r.name] = r.subcategories;
});
// Use subMap instead of subcategories prop in data payload
```

Then remove `subcategories` from `UseCardExportDeps` interface — it's no longer needed since we derive from IDB.

### File 3: `src/hooks/useCards.ts`

Remove `subcategories` from the `useCardExport` deps object (it reads from IDB now).

## Scope

- No UI changes
- No validation logic changes (Steps 1-3 untouched)
- `onImport` prop signature unchanged
- Backward compatible: legacy imports still use the separate subcategories path
- Export still writes `subcategories` field for backward compatibility with older importers

