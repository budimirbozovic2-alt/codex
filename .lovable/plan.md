

# Tier 3 Step 2: Foreign Key Integrity Guard

## What
Insert a relational integrity check between the UUID validation block (line 167) and `setProgress(80)` (line 169). Also add the missing `db` import.

## Changes

### `src/components/ExportImportDialog.tsx`

**Line 3** — Add import:
```typescript
import { db } from "@/lib/db";
```

**Lines 168–169** — Insert relational guard between end of MindMaps validation and `setProgress(80)`:
```typescript
      // --- STEP 2: RELATIONAL INTEGRITY GUARD ---
      if (errors.length === 0) {
        const validCategoryIds = new Set<string>();
        if (parsed.categories && Array.isArray(parsed.categories)) {
          parsed.categories.forEach((cat: any) => validCategoryIds.add(cat.id));
        }
        const existingCats = await db.categories.toArray();
        existingCats.forEach(cat => validCategoryIds.add(cat.id));

        if (importedCards.length > 0) {
          for (let i = 0; i < importedCards.length; i++) {
            const c = importedCards[i];
            if (c.categoryId && !validCategoryIds.has(c.categoryId)) {
              errors.push(`Kartica '${c.question?.substring(0,15)}...' pripada predmetu koji ne postoji u bazi ni u fajlu.`);
              break;
            }
          }
        }
        if (parsed.sources && Array.isArray(parsed.sources)) {
          for (let i = 0; i < parsed.sources.length; i++) {
            const s = parsed.sources[i];
            if (s.categoryId && !validCategoryIds.has(s.categoryId)) {
              errors.push(`Izvor '${s.title?.substring(0,15)}...' pripada predmetu koji ne postoji.`);
              break;
            }
          }
        }
      }
      // --- END RELATIONAL INTEGRITY GUARD ---

      setProgress(80);
```

## Scope
- UUID validation block (Step 1) untouched
- UI components untouched
- Only the validation pipeline inside `handleFileSelect` is extended

