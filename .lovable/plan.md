

# Audit Report: Forum Iustitiae — Phase 3 Review

## 1. Data-to-Visual Mapping (The Logic)

### Material Tier Formula (`forum-logic.ts:61-67`)
Mastery is computed as `(reviewSections / totalSections) * 100` — the percentage of FSRS sections in `SectionState.Review` (state 2).

| Mastery % | Tier    |
|-----------|---------|
| ≥ 95      | gold    |
| ≥ 80      | marble  |
| ≥ 60      | stone   |
| ≥ 30      | brick   |
| < 30      | wood    |

### Crumbling Threshold (`forum-logic.ts:112`)
`crumbling = (leechCount / totalSections) > 0.2` — when more than 20% of sections have 5+ lapses, the monument pulses and cracks appear.

### Effect Thresholds (`monument-effects.tsx`)
| Effect | Condition | Detail |
|--------|-----------|--------|
| Cracks | `crumbling === true` | Opacity scales with `leechCount / totalCards * 2`, capped at 0.8 |
| Ivy/Moss | `avgStability < 10` | Opacity = `(10 - stability) / 10`, range 0.2–0.8 |
| Torches | `mastery > 30` | Count by tier: gold=4, marble=3, stone=2, else=1 |
| Scaffolding | `material === "wood"` | Fixed 50% opacity wooden beams |
| Fountain | `avgStability > 30 && mastery > 60` | Animated water droplets |

### Atmosphere (`ForumAtmosphere.tsx`)
- **dayPhase**: `minutesSinceMidnight / 1440` (0–1 cycle, real wall-clock)
- **warmth**: `min(1, velocity / 100)` — 100+ reviews/week = max warmth
- Gradient hue shifts from 230 (night blue) toward 40 (warm amber) based on `sunArc * warmth`
- Golden horizon glow peaks at sunrise/sunset transitions

## 2. SVG Architecture

### Primitives (`monument-svg.tsx`)
6 reusable SVG `<g>` groups: `Column`, `TriangularRoof`, `DomeRoof`, `Base`, `Arch`, `Wall`. Each accepts `tier: MaterialTier` and computes fill/stroke from `TIER_FILLS` palette. Conditional rendering uses a `switch(tier)` inside each primitive — e.g., Column renders:
- wood: simple timber post
- brick: tapered pillar with horizontal mortar lines
- stone: fluted Doric with capital
- marble: Ionic with volute circles
- gold: Corinthian with acanthus leaf `<path>` details

### Composers (`monument-buildings.tsx`)
10 building functions compose primitives into complete structures. All share `viewBox="0 0 200 160"`. A `BUILDING_MAP` record maps `BuildingType → React.FC`. `MonumentSVG` switches via this map with `Insula` fallback.

### Animations (`MonumentCard.tsx:96-109`)
- **Upgrade detection**: `useRef<MaterialTier>` tracks previous tier. `useEffect` compares indices in `TIER_ORDER` array — triggers only on upgrade (higher index).
- **Shimmer**: `motion.div` with linear gradient slides from -100% to 300% x over 1s.
- **Particles**: 10 `motion.div` circles scatter outward from center with randomized angle, distance (40-80px), delay (0-0.3s), duration (0.8-1.2s). Colors mapped per tier.
- Both wrapped in `AnimatePresence`, auto-dismiss after 2s timeout.

## 3. Persistence & State

### BuildingType Storage
- `localStorage` key: `codex-monument-types`
- Shape: `Record<string, BuildingType>` (category name → building type)
- Written by `saveMonumentType()`, read by `loadMonumentTypes()` — called inside `calculateForumState()` on every Forum render
- CategoryManager maintains local state synced via `handleSetBuildingType`

### Sync Risk Assessment
- **Low risk**: Forum reads from `useCardContext().cards` via `useMemo` — same reactive source as the rest of the app. Any card update (review, edit) triggers re-render of `cards` object, which recalculates `forumState`.
- **Caveat**: `calculateForumState` is a pure function called inside `useMemo([cards])`, so it always reflects current state.

### Easter Egg Persistence
- `ForumContext.tsx`: `unlocked` state initialized from `localStorage.getItem("codex-forum-unlocked") === "1"`. Set to `"1"` on `enterForum()`. Persists across sessions and tabs.

## 4. Performance & Optimization

- `MonumentCard` is wrapped in `React.memo` — only re-renders when its specific `monument` object or `index` changes.
- `MonumentDetailDialog` is also `React.memo` with `useMemo` for category card computation.
- `ForumAtmosphere` is `React.memo` with two `useMemo` calls for gradient/glow — only recalculates when `dayPhase` or `warmth` change.
- `forumState` in `RomanForumPage` is `useMemo([cards])` — recomputes only on card state changes.
- SVG buildings are lightweight inline elements with no DOM event listeners; effects use simple SVG `<animate>` (not JS animation loops).

## 5. Issues Found

### Issue A: Dead variable `totalMastered` (`forum-logic.ts:183`)
Declared `let totalMastered = 0` but never incremented or used. Dead code — should be removed.

### Issue B: Duplicate `BuildingType` export
`BuildingType` is exported from both `forum-logic.ts:13` AND `monument-buildings.tsx:9`. CategoryManager imports from `forum-logic.ts`, MonumentCard uses the type from `monument-buildings.tsx` indirectly. This creates a maintenance risk — one could diverge from the other.
**Fix**: Remove the duplicate from `monument-buildings.tsx`, import from `forum-logic.ts` instead.

### Issue C: Dead variable `totalCards` (`forum-logic.ts:182`)
`const totalCards = cards.length` — declared but never used (overall mastery is computed from sections, not cards). Dead code.

### Issue D: `torch-glow` gradient ID collision (`monument-effects.tsx:47`)
If multiple MonumentCards render simultaneously (they do in the grid), all share the same `<defs><radialGradient id="torch-glow">`. SVG IDs are document-global — only the first definition wins. Cards with different tier torch colors would all reference the same gradient.
**Fix**: Make the ID unique per monument, e.g., `torch-glow-${monument.category}`.

### Issue E: Zero-card category handling
When a category has 0 cards, `buildMonument` returns a valid object with `mastery: 0, material: "wood"`. The building renders correctly as a wood-tier Insula with scaffolding overlay. No crash, but a category with 0 cards shouldn't appear as a monument — this is currently handled correctly since `calculateForumState` groups by `card.category`, so empty categories never appear.

### Issue F: No `useCallback` on `handleStartReview` in `MonumentDetailDialog`
Minor — the function recreates on every render. Should use `useCallback([onClose, navigate, monument])`.

---

## Summary

The foundation is **solid with 4 actionable fixes** before Phase 4:

| # | Severity | Fix |
|---|----------|-----|
| A | Low | Remove dead `totalMastered` variable |
| B | Medium | Remove duplicate `BuildingType` from `monument-buildings.tsx` |
| C | Low | Remove dead `totalCards` variable |
| D | Medium | Unique SVG gradient IDs to prevent torch-glow collision |
| E | — | No action needed (correctly handled) |
| F | Low | `useCallback` for `handleStartReview` |

All FSRS math is untouched. No structural regressions detected.

