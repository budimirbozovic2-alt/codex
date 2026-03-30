

# Strict 3-Tier Taxonomy: Category → Subcategory → Chapter

## Current State

- **CategoryRecord.subcategories**: flat `string[]` — no chapter association
- **Chapters**: stored ad-hoc in `idbSettings` keys like `chapters-{catId}-{subName}` and derived from card properties
- **CardOrgMode**: mixes taxonomy CRUD (add/rename/delete subs & chapters) with card drag-and-drop assignment
- **Card form (MetadataSection)**: chapter dropdown loads from `idbSettings`, not from a canonical tree
- **useCategoryManagement**: `addSubcategory`/`renameSubcategory`/`deleteSubcategory` only update an in-memory `Record<string, string[]>` — subcategories are NOT persisted to `CategoryRecord.subcategories` in IDB consistently

## Architecture

```text
CategoryRecord (IDB)
├── id: UUID
├── name: string
├── subcategories: SubcategoryNode[]   ← NEW structure
│   ├── name: string
│   ├── chapters: string[]
│   └── sortOrder: number
└── sortOrder, color
```

No IDB schema version bump needed — `subcategories` is a non-indexed field, so changing its shape from `string[]` to `SubcategoryNode[]` is transparent to Dexie.

## Plan

### Phase 1: Data Layer Migration

**File: `src/lib/db.ts`**
- Add `SubcategoryNode` interface: `{ name: string; chapters: string[]; sortOrder: number }`
- Change `CategoryRecord.subcategories` type from `string[]` to `SubcategoryNode[]`
- Update `createDefaultCategories()` to use empty `SubcategoryNode[]`

**File: `src/hooks/useCardBootstrap.ts`**
- In the bootstrap where `subsMap` is built from `cat.subcategories`: detect if entry is a plain string (legacy) vs `SubcategoryNode` object; auto-migrate to `SubcategoryNode` format
- Build fallback nodes: scan all cards for the category; if a card has `subcategory` or `chapter` not present in the tree, create corresponding nodes dynamically (the "Opšte" fallback)
- Persist migrated `subcategories` back to `db.categories.update()`

**File: `src/hooks/useCategoryManagement.ts`**
- Rewrite `addSubcategory` / `renameSubcategory` / `deleteSubcategory` to operate on `SubcategoryNode[]` and persist to `db.categories.update(catId, { subcategories: newNodes })`
- Add `addChapter(catId, subName, chapterName)`, `renameChapter(...)`, `deleteChapter(...)`, `reorderSubcategories(...)`, `reorderChapters(...)` — all persist to IDB
- Delete chapter moves affected cards to `chapter: ""` (non-destructive)
- Delete subcategory moves affected cards to `subcategory: "", chapter: ""` (non-destructive)

**File: `src/contexts/AppContext.tsx`**
- Expose new chapter CRUD functions via `CardActionsContextValue`

### Phase 2: Structure Manager Dialog

**New file: `src/components/category/StructureManagerDialog.tsx`**
- Modal dialog triggered by a "⚙ Struktura" button in CategoryView header
- Two-level accordion/tree UI:
  - Level 1: Subcategories (add / rename / delete / reorder via up/down arrows)
  - Level 2: Chapters within selected subcategory (add / rename / delete / reorder)
- Delete actions show confirmation: "Ovo će premjestiti sve kartice u Neraspoređene"
- Calls `addSubcategory`, `renameSubcategory`, `deleteSubcategory`, `addChapter`, `renameChapter`, `deleteChapter`, `reorderSubcategories`, `reorderChapters` from context

**File: `src/views/CategoryView.tsx`**
- Add "⚙ Struktura" button next to the category title (top-right of header)
- State: `structureOpen` boolean, renders `<StructureManagerDialog>` when true

### Phase 3: Cascading Dropdowns in Card Form

**File: `src/hooks/useCardActions.ts`**
- Remove the `idbLoadSettings` chapter loading logic (lines 136-148)
- Derive `availableChapters` from `subcategories[category]` → find the matching `SubcategoryNode` → return its `.chapters`
- When subcategory changes, reset chapter to `""`

**File: `src/components/card-form/MetadataSection.tsx`**
- Chapter dropdown already conditionally renders when subcategory is selected (line 112) — this stays
- `availableChapters` now comes from the canonical tree, not from idbSettings
- Remove "+" button for creating new chapters inline (structure changes go through Structure Manager only)
- Remove "+" button for creating new subcategories inline (same reason)

### Phase 4: Strip CRUD from CardOrgMode

**File: `src/components/category/CardOrgMode.tsx`**
- Remove props: `addSubcategory`, `renameSubcategory`, `deleteSubcategory`
- Remove state: `newSubName`, `editingSubName`, `editSubValue`, `editingChapter`, `editChapterValue`, `newChapterName`, `addingChapterFor`
- Remove handlers: `handleAddSubcategory`, `handleRenameSubcategory`, `handleDeleteSubcategory`, `handleRenameChapter`, `handleDeleteChapter`, `handleAddChapter`
- Remove all Edit2/Trash2 buttons and Input fields for subcategory/chapter CRUD from the render
- Keep: DnD context, SortableCardTile, DroppableChapterHeader, drag overlay, `buildTree`, `assignChapter`, `patchCard`
- Add new prop: `subcategoryNodes: SubcategoryNode[]` — use these to build the tree structure (ensuring empty nodes still appear as drop targets)
- `buildTree()`: merge `SubcategoryNode[]` structure with actual card data, so empty chapters/subcategories are visible as drop targets

**File: `src/views/CategoryView.tsx`**
- Remove `addSubcategory`, `renameSubcategory`, `deleteSubcategory` from CardOrgMode props
- Pass `subcategoryNodes={category.subcategories}` instead

### Cleanup

**File: `src/hooks/useChapterManagement.ts`**
- Delete entirely — chapters are now stored in `CategoryRecord.subcategories[n].chapters`, not in separate idbSettings keys
- Or keep as deprecated with a migration note

## Guardrails Respected

- **Pure UUID**: All operations use `categoryId` (UUID). No name-based lookups introduced
- **Load guards**: `useCardBootstrap.ts` `bumpMapVersion()`, LearnPage/ReviewPage ready guards — untouched
- **Non-destructive deletion**: All delete operations move cards to uncategorized, never delete cards
- **No IDB version bump**: `subcategories` is a data field, not an indexed column
- **Iterative scope**: Only taxonomy-related files touched. FSRS, SR settings, export/import, forum, mnemonic modules: untouched

## Estimated Scope
- ~6 files modified, 1 new file created, 1 file potentially deleted
- ~300 lines changed total

