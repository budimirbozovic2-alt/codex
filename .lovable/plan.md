

# Add `category` Field to Sources — Unified Category Container

## Problem
Sources currently have no `category` field. The link between a source and a category is inferred indirectly through cards (`card.sourceId` → source, `card.category` → category). This is fragile — unlinked sources have no category, auto-link must guess, and the Forum/Registry reverse-engineer categories from card links.

## Solution
Add a `category` field directly to the `Source` interface and DB schema. Categories become a first-class container for both cards and sources. All downstream systems (auto-link, Forum, Registry, source list, LinkToExistingCardModal) use the direct field instead of inference.

## Architecture

### 1. DB Schema: `src/lib/db.ts`
- Add `category` to `Source` interface: `category?: string`
- Add DB version 6 with updated sources index: `"id, label, category, version, createdAt"`
- Add upgrade handler for v5→v6: existing sources get `category` populated from the most common `card.category` among linked cards (best-effort migration), or `undefined` if no links exist

### 2. Source Import UI: `src/views/SourcesView.tsx`
- Add a **category selector** (dropdown from `categories` list) to the import dialog, alongside label/date/gazette fields
- New state: `importCategory` — pre-selected to the first category or empty
- When saving, set `source.category = importCategory`
- Also add category display as a Badge on each source card in the list
- Edit dialog (`editingSource`): add category field to edit metadata

### 3. Auto-Link: `src/lib/auto-link-suggestion.ts`
- Replace the inferred `sourceCategoryMap` logic with direct `source.category` check
- Rule A becomes: `source.category === card.category` (skip sources with no category)
- Much simpler and more reliable

### 4. LinkToExistingCardModal: `src/components/LinkToExistingCardModal.tsx`
- No change needed — already filters by `card.category === sourceLabel`. This continues to work correctly since the modal is opened from within a source context.

### 5. Source Reader link flow: `src/hooks/useSourceLogic.ts`
- When linking a card via "Poveži sa postojećim", if the source has a `category`, use it to pre-filter cards (already done via `sourceLabel` prop — but now backed by real data)

### 6. Forum Logic: `src/lib/forum-logic.ts`
- Currently groups cards by `card.category` to build monuments — no change needed since cards already have category
- **Enhancement**: Sources with a `category` but no linked cards can now appear in the Forum as "available resources" count on the monument (optional, cosmetic)

### 7. Source Registry: `src/components/SourceManager.tsx`
- Currently reverse-engineers category from card links (lines 118-127: `matchingCat` search)
- Replace with direct `source.category` lookup — much faster and always accurate
- The monument's category field becomes reliable even for sources with zero linked cards

### 8. Source Hierarchy: `src/hooks/useSourceHierarchy.ts`
- Uses `sources` parameter but doesn't currently read category from them — no change needed (hierarchy is card-driven)

### 9. Export/Import: `src/hooks/useCardExport.ts`, `src/hooks/useCardImport.ts`
- Sources are exported via `db.sources.toArray()` — the new `category` field will be included automatically
- Import: sources from older backups without `category` will have `undefined` — this is fine (optional field)

### 10. Sources Storage: `src/lib/sources-storage.ts`
- No changes needed — `saveSource` uses `db.sources.put()` which will persist the new field

## Files Changed

| File | Change |
|------|--------|
| `src/lib/db.ts` | Add `category?: string` to Source interface, DB v6 with index + migration |
| `src/views/SourcesView.tsx` | Category selector in import dialog, category badge on source cards, category in edit dialog |
| `src/lib/auto-link-suggestion.ts` | Replace inferred category map with direct `source.category` check |
| `src/components/SourceManager.tsx` | Replace reverse-engineered `matchingCat` with `source.category` |

## Migration Strategy
- DB v6 upgrade runs once: iterates sources, finds linked cards, sets `source.category` to the most common category among linked cards
- Sources with no linked cards get `category = undefined` (user can set it later via edit)
- Field is optional (`category?: string`) so old backups import cleanly

## No Breaking Changes
- All existing data preserved
- Old exports without `category` on sources import fine (field is optional)
- Forum and Registry get more accurate data without logic changes

