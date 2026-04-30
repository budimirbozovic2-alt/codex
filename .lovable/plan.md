## Audit Status

| # | Item | Status |
|---|---|---|
| 1 | Drop unused indexes on `cards` table (Dexie v16) | ⚠️ Implement |
| 2 | Delete dead redirect routes in `App.tsx` | ⚠️ Implement |
| 3 | Delete `SpeedReaderDisplay.tsx` (zero importers) | ⚠️ Implement |
| 4 | Remove `preSelectedCategory` prop chain | ⚠️ Implement |
| 5 | Delete `calcEnergyRecommendation` + `addDiaryEntry` (orphans) | ⚠️ Implement |

Confirmed via `rg`:
- `frequencyTag` / `sourceType` / `chapterId` are never queried via `db.cards.where(...)` — filtering is in-memory only.
- `SpeedReaderDisplay.tsx` has zero importers anywhere in `src/`.
- `preSelectedCategory` is propagated `ReviewPage → ReviewSession → ReviewSetup` but `ReviewSetup` immediately collapses it via `lockedCategory ?? preSelectedCategory ?? null`. `ReviewPage` passes `lockedCategory` to BOTH props, so removing `preSelectedCategory` is a no-op in behavior.
- `calcEnergyRecommendation` is consumed only in `useDashboardData.ts` (`energyRec` → status icons / brief text).
- `addDiaryEntry` has zero call sites (the diary input UI was already removed).

## Item 1 — Dexie v16 schema bump

`src/lib/db-schema.ts`: append a v16 store migration that respecifies the `cards` schema **without** `frequencyTag`, `sourceType`, `chapterId`, or the two compound `[…+chapterId]` indexes:

```ts
// v16: drop unused secondary indexes (frequencyTag, sourceType, chapterId,
// [categoryId+chapterId], [subcategoryId+chapterId]). All filtering on these
// fields is in-memory; the indexes only added write-amplification.
this.version(16).stores({
  cards: "id, categoryId, subcategoryId, type, createdAt, sourceId, [categoryId+subcategoryId]",
});
```

Earlier versions (v12, v15) stay intact — Dexie applies them in order so existing DBs upgrade cleanly. No data migration callback needed; Dexie drops the obsolete indexes automatically when the new schema string is applied.

## Item 2 — Dead routes

`src/App.tsx` lines 81, 82, 85: delete the three `<Navigate>` redirect entries. The catch-all `*` route at line 88 already serves `NotFound` for any visitor still hitting these legacy URLs (acceptable — they were removed long ago).

## Item 3 — Delete `SpeedReaderDisplay.tsx`

`rm src/components/speed-reader/SpeedReaderDisplay.tsx`. No imports anywhere in the codebase — confirmed via `rg`.

## Item 4 — Remove `preSelectedCategory` prop chain

Three files touched, mechanical:

**`src/components/review/review-constants.ts`** (line 35): delete the `preSelectedCategory?: string | null;` field on `ReviewSessionProps`.

**`src/components/ReviewSession.tsx`**:
- Line 19: drop `preSelectedCategory` from the destructured props.
- Line 152: drop the `preSelectedCategory={preSelectedCategory}` JSX prop on the `<ReviewSetup>` call.

**`src/components/review/ReviewSetup.tsx`**:
- Lines 25 + 104: drop the prop from the interface and the destructure.
- Line 107: simplify to `const selectedCategory = lockedCategory ?? null;`.

**`src/views/ReviewPage.tsx`** (line 116): drop the `preSelectedCategory={lockedCategory}` JSX prop on the `<ReviewSession>` call.

Behavior identical: every code path that was passing `preSelectedCategory` was also passing `lockedCategory` to the same value, and `ReviewSetup` already preferred `lockedCategory`.

## Item 5 — Diary orphans

**`src/lib/analytics/recovery.ts`**:
- Delete `calcEnergyRecommendation` function (lines 59–76).
- Delete `EnergyRecommendation` type (lines 53–57).
- Delete the now-unused `import { loadDiary } from "../metacognitive-storage";` on line 2.

**`src/lib/cognitive-analytics.ts`** (line 6): remove `calcEnergyRecommendation` and `type EnergyRecommendation` from the re-export list.

**`src/hooks/useDashboardData.ts`**:
- Line 15: drop `calcEnergyRecommendation` import.
- Line 171: delete `const energyRec = useDeferredCompute(...)`.
- Lines 247–249: delete the `if (energyRec?.suggestMnemonics) { parts.push("💡 …"); }` block.
- Line 251: drop `energyRec` from the dep array.

**`src/lib/metacognitive-storage.ts`**: delete `addDiaryEntry` (lines 68–75). Keep `loadDiary` / `saveDiary` / `_diaryCache` / `DiaryEntry` interface and the `db.diary` table — they remain referenced by:
- `db-schema.ts` (table definition)
- `_diaryCache` cache init in `initMetacognitiveCache`
- The `diary` field is still part of backup/restore JSON shape

Removing only the unused `addDiaryEntry` writer is the safe minimal cut. The reader path stays so any historic diary data backed up earlier still loads/exports correctly.

## Verification

- TypeScript build clean (no `any`, no orphan imports).
- `rg "preSelectedCategory|calcEnergyRecommendation|addDiaryEntry|SpeedReaderDisplay"` returns zero hits in `src/` after the change.
- Dexie auto-upgrades when the user next opens the app: existing rows preserved; obsolete indexes dropped.
- Existing tests untouched (none reference the removed surfaces).

## Files

- **Edit**: `src/lib/db-schema.ts`
- **Edit**: `src/App.tsx`
- **Delete**: `src/components/speed-reader/SpeedReaderDisplay.tsx`
- **Edit**: `src/components/review/review-constants.ts`
- **Edit**: `src/components/ReviewSession.tsx`
- **Edit**: `src/components/review/ReviewSetup.tsx`
- **Edit**: `src/views/ReviewPage.tsx`
- **Edit**: `src/lib/analytics/recovery.ts`
- **Edit**: `src/lib/cognitive-analytics.ts`
- **Edit**: `src/hooks/useDashboardData.ts`
- **Edit**: `src/lib/metacognitive-storage.ts`
