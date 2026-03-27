

# Smart Source Engine & Hierarchy Manager

## Overview
Build a Source Registry (alias/normalization system) and a dynamic depth algorithm that uses Source labels to drive the Knowledge Map hierarchy. Cards link to Sources via `sourceId` — the Source's `label` becomes the organizing principle instead of manual subcategories.

## Architecture

```text
source-registry.ts        ← Storage & alias resolution logic
SourceManager.tsx          ← UI component (new tab in Database page)
useSourceHierarchy.ts      ← Hook: A/B depth calculator + tree builder
KnowledgeMap.tsx           ← Updated to use source-based hierarchy
forum-logic.ts             ← Updated to aggregate by Master Source
```

## Data Model

### Source Registry (`localStorage: codex-source-registry`)
```ts
interface SourceAlias {
  rawLabel: string;        // original Source.label
  masterSource: string;    // normalized "Master Source" name
}

interface CategoryOverride {
  category: string;
  forcedMode: "A" | "B" | null;  // null = auto
}

interface SourceRegistry {
  aliases: SourceAlias[];
  overrides: CategoryOverride[];
}
```

### Resolution Logic
For each card with a `sourceId`, look up the linked Source's `label`, then check the registry for an alias mapping. If found, use the `masterSource` name. If not, use the raw `label` as-is. Cards without `sourceId` get grouped under "Bez izvora".

## Task 1: `src/lib/source-registry.ts` (New)

Pure functions for registry CRUD:
- `loadSourceRegistry(): SourceRegistry`
- `saveSourceRegistry(registry): void`
- `resolveMasterSource(rawLabel, registry): string` — returns master name or raw label
- `getUniqueSources(cards, sources, registry): { masterSource: string; rawLabels: string[]; cardCount: number }[]`
- `getCategoryDepthMode(category, cards, sources, registry): "A" | "B"` — the A/B algorithm:
  - Check for manual override first
  - Count distinct Master Sources in this category
  - If ≥2 distinct sources → mode A (L1=Source, L2=H1)
  - If 1 source has ≥90% of cards → mode B (L1=H1, L2=H2)

## Task 2: `src/hooks/useSourceHierarchy.ts` (New)

Hook that builds the dynamic tree for KnowledgeMap:
```ts
function useSourceHierarchy(cards, sources, category): HierarchyNode[]
```

Uses `useMemo` over `[cards, sources, category]`. For each card in the category:
1. Resolve its Master Source name
2. Parse existing subcategory/chapter as H1/H2 stand-ins (since cards don't have H1/H2 fields today — the subcategory IS the structural level)
3. Build tree based on mode A or B

**Mode A tree**: `Master Source > Subcategory`
**Mode B tree**: `Subcategory > Chapter`

Returns array of `{ name: string; children: { name: string; cards: Card[] }[]; cardCount: number }`.

## Task 3: `src/components/SourceManager.tsx` (New)

New tab in DatabasePage called "Registar izvora". UI sections:

**Section 1: Master Sources table**
- Lists all unique Source labels found across cards (via `sourceId` → Source lookup)
- Each row: raw label, assigned Master Source (editable), card count
- "Merge" action: select multiple raw labels → assign to one Master Source name
- Uses existing `Dialog`, `Input`, `Badge`, `Button` components

**Section 2: Category Depth Overrides**
- Lists categories that have source-linked cards
- Shows auto-detected mode (A or B) with explanation
- Toggle to force A or B

**Section 3: Stats summary**
- Total sources, total aliases, categories in mode A vs B

## Task 4: DatabasePage Update

Add a 4th tab "Registar" with a `Library` icon:
```tsx
<TabsTrigger value="registry">Registar</TabsTrigger>
<TabsContent value="registry">
  <SourceManager />
</TabsContent>
```

## Task 5: KnowledgeMap Integration

In the "subcategories" step of KnowledgeMap, when a category has source-linked cards:
- Import and call `useSourceHierarchy` to get the dynamic tree
- If mode A: Level 1 shows Master Source names instead of subcategories
- If mode B: Level 1 shows subcategories as before (but derived from source structure)
- Cards without `sourceId` fall into an "Ostalo" group as they do now
- The existing SubcategoryCard component can be reused — it just gets different data
- Navigation still flows: Category → L1 → L2 → MentalSkeleton detail

**Important**: Categories with NO source-linked cards continue using the existing subcategory system unchanged. The source hierarchy only activates when cards have `sourceId` links.

## Task 6: Forum Integration

In `forum-logic.ts`, update `calculateForumState`:
- Load the source registry
- For monuments, optionally sub-group by Master Source (adding a `sources` array to the `Monument` interface)
- Monument mastery stats remain aggregated at the category level (no visual change)
- MonumentDetailDialog can show a "by source" breakdown in the card list

## Performance

- `useSourceHierarchy` uses `useMemo([cards, category])` — only recomputes when cards change
- `resolveMasterSource` is O(1) with a pre-built `Map<string, string>` from the registry
- Source lookup by ID uses a `Map<string, Source>` built once per render cycle
- No new IndexedDB queries — Sources are already loaded in SourcesView; pass them through context or load once

## Execution Order

1. Create `src/lib/source-registry.ts` (pure logic, no React)
2. Create `src/hooks/useSourceHierarchy.ts` (hook)
3. Create `src/components/SourceManager.tsx` (UI)
4. Update `src/views/DatabasePage.tsx` (add 4th tab)
5. Update `src/components/KnowledgeMap.tsx` (use source hierarchy)
6. Update `src/lib/forum-logic.ts` (aggregate by source)

## Guardrails
- No FSRS math changes
- No changes to Card interface (uses existing `sourceId` + Source.label)
- Existing subcategory navigation preserved for categories without sources
- Standard barrel imports for icons
- `useMemo` for all hierarchy computations

