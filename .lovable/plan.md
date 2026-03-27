

# Refactor Source Registry → "Forum Architect's Table"

## Concept Mapping
The existing data model already supports this — no schema changes needed:
- `SourceAlias.masterSource` = Monument name (e.g., "Upravno pravo")
- `SourceAlias.rawLabel` = Individual law (e.g., "Zakon o upravnom postupku")
- `CategoryOverride.forcedMode` = A/B display mode

The refactoring is purely **UI restructuring** + **terminology rename**.

## Changes

### 1. `src/components/SourceManager.tsx` — Full UI restructure (~200 lines rewrite)

**Current**: Flat list of labels (mapped/unmapped) + separate category override section.

**New layout**:

```text
┌─────────────────────────────────────────┐
│ Stats: N Spomenika │ N Zakona │ N Neprepoznatih │
├─────────────────────────────────────────┤
│ 🔍 Pretraži...                          │
├─────────────────────────────────────────┤
│ ⚠ Neprepoznati izvori (3)               │
│  ├ "Zakon o radu" [Kreiraj Spomenik] [Dodaj u postojeći] │
│  └ "Pravilnik X"  [Kreiraj Spomenik] [Dodaj u postojeći] │
├─────────────────────────────────────────┤
│ 🏛 Spomenici                            │
│                                         │
│ ┌ Upravno pravo ──── Mod A: Grupni ──┐ │
│ │  Zakoni u ovom spomeniku:           │ │
│ │   • Zakon o upravnom postupku (45)  │ │
│ │   • Zakon o upravnom sporu (32)     │ │
│ │  [+ Dodaj novi zakon u ovaj spomenik] │
│ │                                     │ │
│ │  Prikaz: ○ Grupni (više izvora)     │ │
│ │          ● Detaljni (jedan izvor)   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌ Krivični zakonik ── Mod B: Detaljni ┐ │
│ │  Zakoni u ovom spomeniku:           │ │
│ │   • Krivični zakonik (120)          │ │
│ │  [+ Dodaj novi zakon]               │ │
│ │                                     │ │
│ │  Prikaz: ● Grupni    ○ Detaljni    │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

Key UI changes:
- **Monument-centric grouping**: Group aliases by their `masterSource` value, show each as an expandable card
- **Laws listed inside monument**: Each alias `rawLabel` appears as a child item with card count and a remove button
- **"Dodaj novi zakon" button** inside each monument: Opens dialog to pick from unmapped sources
- **A/B mode as radio group** inside each monument card:
  - "Grupni prikaz (Više izvora)" = Mode A → L1: individual laws, L2: subcategories
  - "Detaljni prikaz (Jedan izvor)" = Mode B → L1: subcategories, L2: chapters
- **Rename "Spoji" dialog** → "Kreiraj novi spomenik" with terminology update
- Unmapped section stays at top with same actions but relabeled

### 2. `src/lib/source-registry.ts` — Terminology in comments only
No functional changes. The `masterSource` field name stays (it IS the monument). Only update JSDoc comments to mention "Spomenik" for developer clarity.

### 3. `src/lib/forum-logic.ts` — No changes needed
`calculateForumState` already groups cards by `category` and computes `sources[]` breakdown per monument using `resolveMasterSource`. The A/B hierarchy is handled by `useSourceHierarchy` in `MonumentInterior`. No logic changes required.

### 4. `src/hooks/useSourceHierarchy.ts` — No changes needed
Already reads `getCategoryDepthMode` which respects `overrides.forcedMode`. Mode A groups by source, Mode B by subcategory/chapter. Working correctly.

## Files Changed

| File | Change |
|------|--------|
| `src/components/SourceManager.tsx` | Full UI restructure: monument-centric cards, radio A/B, "Dodaj zakon" button |

## What stays the same
- `SourceRegistry` data shape (aliases + overrides)
- `source-registry.ts` functions
- `forum-logic.ts` calculation
- `useSourceHierarchy` hook
- All persistence and event emitter logic

