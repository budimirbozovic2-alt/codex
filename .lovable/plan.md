

# Global UI/UX Standardization — High-End Modern Software Aesthetic

## Overview
Strip all game-like, ancient-Rome, and old-fashioned visual effects. Establish a clean, premium fintech aesthetic: DM Sans for all body/data text, Cinzel reserved for primary page titles only, fast subtle transitions, no particles/shimmer/glow, standardized glass-card borders.

## Scope of Changes

### 1. Typography Cleanup

**`src/index.css`** (lines 611-614, 726-730):
- Remove the `h1, h2, .font-display { font-family: var(--font-display) }` rule at line 728-730 (it forces Cinzel on ALL headings)
- Keep headings as DM Sans by default (already set at line 608, 611-614)
- `.font-display` class remains available but will only be applied manually to primary page titles

**52 component files** using `font-display`:
- Keep `font-display` ONLY on primary page titles: `h1` elements in RomanForumPage, Dashboard heading, StatsPage title, PlannerPage title, etc.
- Remove `font-display` from: stat numbers, labels, section headers, buttons, badges, ArchNode `h4`, MonumentInterior `h2`, phase labels, all `text-[10px]` labels, source breakdown labels, all `tabular-nums` data displays
- This is ~50+ individual class removals across files. Key files:
  - `MonumentCard.tsx` — remove from phase label (line 184)
  - `MonumentInterior.tsx` — remove from h2 (line 103), source labels (line 181), review button (line 115)
  - `ArchNode.tsx` — remove from h4 (line 53)
  - `Dashboard.tsx` — remove from Forum link h3 (line 126)
  - `ReviewComplete.tsx` — keep on h2 (primary heading)
  - `SessionComplete.tsx` — keep on heading
  - `CognitiveAnalytics.tsx` — remove from all stat numbers
  - `RoadmapTab.tsx` — remove from stat numbers
  - All `planner/`, `stats/`, `dashboard/` sub-components — audit and remove from non-title elements

### 2. Animation Cleanup

**`src/components/gamification/MonumentCard.tsx`**:
- Delete `PARTICLE_COLORS`, `SHIMMER_COLORS` constants, `generateParticles()` function
- Delete `upgraded`/`particles` state + the `useEffect` detecting phase changes
- Delete the entire shimmer `AnimatePresence` block (lines 132-153)
- Delete the entire particle burst `AnimatePresence` block (lines 155-172)
- Remove `animate-pulse` on crumbling monuments (line 124) — replace with a subtle `opacity-75` static class
- Remove `shadow-md shadow-gold/10` and `shadow-lg shadow-gold/20` glow from `PHASE_STYLES` — set all `glow` to `""`
- Keep `layoutId` for zoom-in transition
- Simplify SVG crossfade: reduce duration from 0.6s to 0.25s
- Reduce card entry animation from `y: 24, duration: 0.4` to `y: 10, duration: 0.2`

**`src/components/gamification/ForumTransition.tsx`**:
- Remove `textShadow` from the h1 (line 55)
- Reduce total transition time from 3s to 1.5s (faster cuts)

**`src/index.css`**:
- Delete `@keyframes achievement-glow` and `.achievement-glow` class (lines 764-772)
- Delete `@keyframes mastery-pulse` and `.mastery-complete` class (lines 774-782)
- Delete `.btn-imperial` hover shimmer animation and `@keyframes gold-shimmer` (lines 734-754)
- Keep `.btn-imperial` as a simple class with `border-color` only, no animation

**`src/components/review/ReviewComplete.tsx`** and **`src/components/learn/SessionComplete.tsx`**:
- Remove `achievement-glow` class from the icon container

### 3. UI Kit Synchronization

**`src/index.css`**:
- Standardize `.glass-card` border to `border: 1px solid hsl(var(--gold) / 0.12)` in dark mode, `hsl(var(--border) / 0.5)` in light mode
- Remove `.forum-stone` class (unused after cleanup)
- Standardize `.forum-tablet` to match `.glass-card` styling (same border pattern)

**`src/components/gamification/MonumentCard.tsx` — `PHASE_STYLES`**:
- Standardize all borders to `border-gold/20` (uniform, no per-phase variance)
- Remove all `bg-gold/*` background tints — set all `bg` to `""`
- Keep `accent` color variance (subtle opacity gradient is fine)

**`src/components/gamification/ArchNode.tsx`**:
- Replace `forum-tablet` with `glass-card`
- Change `font-display` on h4 to regular sans
- Ensure mastery bar and overall styling matches MonumentCard's sharpness

### 4. Forum Blueprint Cleanup

**`src/components/gamification/monument-effects.tsx`**:
- `CrackOverlay`: Keep as clean sharp gold vector lines (already good)
- `IvyOverlay`: Keep but remove "leaf" ellipses — use only line paths for status indication
- Remove all `<animate>` SVG elements from torches (flickering) — make torch glow static
- Remove fountain water drop animations — make fountain a static SVG element
- Keep scaffolding as-is (clean lines)

**`src/components/gamification/ForumAtmosphere.tsx`**:
- Remove the golden glow radial gradient at the bottom (lines 39-45)
- Keep the subtle top ambient gradient but reduce max opacity from 0.4 to 0.2

**`src/components/Dashboard.tsx`**:
- Remove the golden radial glow div (line 38)

### 5. Emoji Removal from Phase Icons

**`src/lib/forum-logic.ts`** — `PHASE_ICONS`:
- Replace emojis with clean text indicators or remove entirely:
  - `"📐"` → `""` (or a small Lucide icon reference)
  - All 5 phase icons → empty strings
- In `MonumentCard.tsx` line 179: remove the emoji `<span>` entirely if icons are empty

### 6. Dead CSS Cleanup

**`src/index.css`**:
- Remove duplicate `.glass-card` definition (lines 688-692 duplicated at 719-724)
- Remove `.forum-stone` if no longer referenced

## Files Changed

| File | Change Summary |
|------|---------------|
| `src/index.css` | Remove achievement-glow, mastery-pulse, gold-shimmer, btn-imperial animation, duplicate glass-card, forum-stone; standardize glass-card border; remove Cinzel from all headings |
| `src/components/gamification/MonumentCard.tsx` | Delete particles, shimmer, glow shadows, animate-pulse; standardize borders; simplify transitions |
| `src/components/gamification/ForumTransition.tsx` | Remove textShadow; speed up transition |
| `src/components/gamification/monument-effects.tsx` | Remove SVG `<animate>` elements; static torch/fountain; remove ivy leaves |
| `src/components/gamification/ForumAtmosphere.tsx` | Remove bottom gold glow; reduce ambient opacity |
| `src/components/gamification/ArchNode.tsx` | Use glass-card; remove font-display |
| `src/components/gamification/MonumentInterior.tsx` | Remove font-display from non-title elements; remove MATERIAL_ICONS emoji |
| `src/components/Dashboard.tsx` | Remove golden radial glow; remove font-display from non-title text |
| `src/components/review/ReviewComplete.tsx` | Remove achievement-glow |
| `src/components/learn/SessionComplete.tsx` | Remove achievement-glow |
| `src/lib/forum-logic.ts` | Clear PHASE_ICONS emojis |
| ~40 other component files | Remove `font-display` from stat numbers, labels, sub-headers |

## Execution Order
1. `src/index.css` — CSS foundation cleanup
2. `src/lib/forum-logic.ts` — Phase icons/labels
3. `MonumentCard.tsx` — Strip particles/shimmer/glow
4. `monument-effects.tsx` — Static effects
5. `ForumAtmosphere.tsx` + `ForumTransition.tsx` — Atmosphere cleanup
6. `ArchNode.tsx` + `MonumentInterior.tsx` — UI kit sync
7. `Dashboard.tsx`, `ReviewComplete.tsx`, `SessionComplete.tsx` — Glow removal
8. Batch font-display removal across remaining ~40 files

## Guardrails
- 5-phase construction logic untouched
- FSRS algorithm untouched
- All Phase 1-3 audit fixes preserved
- Serbian Latin maintained throughout
- Blueprint SVG line-art style preserved (just made static)

