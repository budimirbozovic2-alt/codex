## Phase 2 — Hidden Features Cleanup

### 1. File Deletions (5 files)
Delete these orphaned global page files from `src/views/`:
- `MindMapPage.tsx`
- `MnemonicPage.tsx`
- `CreatePage.tsx`
- `StatsPage.tsx`
- `PlannerPage.tsx`

**Verification done:** None of these are imported anywhere except `src/App.tsx` (confirmed via `rg`). The active Dashboard (`DashboardPage.tsx`) does not import `StatsPage` or `PlannerPage` — its stats/planner widgets are independent components and will be untouched.

### 2. `src/App.tsx` Edits
Remove the following lazy imports (lines 19, 22, 23, 24, 30):
```ts
const CreatePage   = lazy(() => import("@/views/CreatePage"));
const StatsPage    = lazy(() => import("@/views/StatsPage"));
const MnemonicPage = lazy(() => import("@/views/MnemonicPage"));
const PlannerPage  = lazy(() => import("@/views/PlannerPage"));
const MindMapPage  = lazy(() => import("@/views/MindMapPage"));
```

Remove these 6 routes (lines 74, 77, 78, 79, 80, 82):
- `/create`
- `/stats`
- `/mnemonics`
- `/mnemonic` (the `<Navigate to="/mnemonics" />` redirect)
- `/planner`
- `/mind-map`

Subject-scoped routes (`/subject/:categoryId/mind-maps`, `/subject/:categoryId/mnemonics`, `/subject/:categoryId/diagnostics`) and their imports are **kept**.

### 3. Restore Diagnostics UI Access (H4)

`SubjectDiagnosticsPage.tsx`, `pages/FrequentErrors.tsx`, and the `/subject/:categoryId/diagnostics` route are kept.

**Current state:** `SubjectDashboard.tsx` already has a Dijagnostika entry — but it's a tiny icon-only button (lines 156-165 of the meta-tools row, just an `AlertTriangle` icon with a tooltip). This is not "clear, accessible" — users won't find it.

**Change:** Promote it to the "Baza i Izvori znanja" grid as a full labeled card so it sits alongside Zettelkasten / Izvori / Kartice (a 4th tile, matching that section's existing styling). Also remove the now-redundant icon-only version from the meta-tools row to avoid duplication.

#### Exact code change in `src/views/SubjectDashboard.tsx`

**A. Add `AlertTriangle` already imported (line 5) — keep.**

**B. Add a 4th item to `knowledgeBaseCards` (lines 91-110):**
```tsx
const knowledgeBaseCards = useMemo(() => [
  {
    to: `/subject/${categoryId}/zettelkasten`,
    icon: Network,
    title: "Zettelkasten",
    desc: "Baza znanja i mentalne mape",
  },
  {
    to: `/category/${categoryId}`,
    icon: BookOpen,
    title: "Izvori",
    desc: "Zakoni, skripte i fokusirano čitanje",
  },
  {
    to: `/subject/${categoryId}/cards`,
    icon: Layers,
    title: "Kartice",
    desc: "Uređivanje i raspored kartica",
  },
  {
    to: `/subject/${categoryId}/diagnostics`,
    icon: AlertTriangle,
    title: "Najčešće greške",
    desc: "Dijagnostika slabih tačaka i lapsusa",
  },
], [categoryId]);
```

**C. Update the grid from `grid-cols-3` to `grid-cols-4` (line 211):**
```tsx
<div className="grid grid-cols-4 gap-3">
```

**D. Remove the redundant icon-only Dijagnostika button + its `Tooltip` wrapper from the meta-tools row (lines 156-165)** so we don't have two entry points. The Info and Settings buttons stay.

This places "Najčešće greške" prominently inside the primary navigation grid users already scan, with the same `glass-card` styling, hover state, and icon treatment as its siblings — fully consistent with the existing design system.

### Output after execution
- Confirmation list of 5 deleted files + 6 removed routes + cleaned imports.
- The exact diff applied to `SubjectDashboard.tsx` (knowledgeBaseCards expansion, grid-cols change, removal of duplicate icon button).
- No build/typecheck command will be run manually (handled by harness).
