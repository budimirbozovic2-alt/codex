

# Imperial Atlas: Polish & Fix

## Current State
The core implementation is **already in place**: `MonumentInterior.tsx`, `ArchNode.tsx`, `MonumentCard.tsx` with `layoutId`, and `RomanForumPage.tsx` with conditional rendering. The source hierarchy engine (`useSourceHierarchy`, `source-registry.ts`) is functional.

## Issues to Fix

### 1. `MonumentInterior.tsx` — Broken Hook Pattern
Lines 87-90 use a fake `useMemo` pretending to be `useState`, then delegate to `InteriorContent` with a mid-file `import { useState }`. This is fragile and unnecessary.

**Fix**: Move `useState` into the main `MonumentInterior` component directly. Remove the `InteriorContent` wrapper — merge everything into one component. The mid-file import is a code smell.

### 2. `MonumentInterior.tsx` — Missing `layoutId` on Interior Wrapper
`MonumentCard` has `layoutId={`monument-${monument.category}`}` but the interior's `motion.div` does **not** have the matching `layoutId`. This means the framer-motion layout animation cannot connect the two — the card just disappears and the interior fades in separately.

**Fix**: Add `layoutId={`monument-${monument.category}`}` to the interior's outer `motion.div` wrapper. This enables the smooth expand/zoom transition the spec requires.

### 3. `RomanForumPage.tsx` — `AnimatePresence` + `layoutId` Conflict
`AnimatePresence mode="wait"` delays the enter of the new element until the exit completes, which fights with `layoutId` (which needs both elements briefly co-existing). 

**Fix**: Remove `mode="wait"` from `AnimatePresence`, or use `LayoutGroup` from framer-motion to scope the layout animations properly.

### 4. `ArchNode.tsx` — Minor Bugs
- Line 121: duplicate ternary text (`"kartica"` for both singular and plural) — fix to show `"kartica"` / `"kartica"` is actually correct in Serbian for this context, but the ternary is pointless. Simplify.
- The `useMemo` for `borderClass` depends on `allMastered` and `hasIvy` which are computed inline — `useMemo` adds overhead without benefit here. Remove it.

## Files Changed

| File | Change |
|------|--------|
| `src/components/gamification/MonumentInterior.tsx` | Merge `InteriorContent` into main component, fix hooks, add `layoutId` |
| `src/views/RomanForumPage.tsx` | Add `LayoutGroup`, remove `mode="wait"` from `AnimatePresence` |
| `src/components/gamification/ArchNode.tsx` | Remove pointless ternary and unnecessary `useMemo` |

## Guardrails
- No FSRS math changes
- No source-registry or hierarchy logic changes
- No new dependencies (LayoutGroup is already in framer-motion)
- MentalSkeleton drill-down flow unchanged

