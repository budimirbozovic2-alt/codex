

# Deep Audit Execution: Phase 1

## Scope Assessment

This phase covers 4 categories. The bulk icon migration (91 files, 448 import lines) is the largest task and will be handled systematically.

---

## Task 1: Critical Logic Fixes (4 bugs)

### 1A. `useDashboardData.ts:155-167` — `recordDayDiscipline` in useMemo
Move the side-effectful `useMemo` block to a `useEffect` with same deps `[reviewLog, dailyGoal]`. Add a `useRef` guard to prevent StrictMode double-fire.

### 1B. `SessionContext.tsx:122` — Non-reactive `queueSize`
Replace raw ref reads with a `[queueSize, setQueueSize]` state. Increment it inside `queueReview`, `queueError`, `queueMarkRead`; reset to 0 in `startSession` and `endSession`.

### 1C. `main.tsx:173-175` — Electron IPC listener leak
Store `doCleanup` reference and call `removeEventListener` in HMR cleanup. Wrap the Electron block with `if (import.meta.hot)` guard to re-register cleanly.

### 1D. `useCardImport.ts:188` — Missing deps
Add `setReviewLog` to `importData`'s dependency array. (`schedulePersist` is a module-level function, not a dep concern.)

---

## Task 2: Modularization

### 2A. Fix UIProvider render cascade (`AppContext.tsx:190`)
**Problem**: `const { cards, toggleTag } = useCardContext()` — destructuring `cards` subscribes UIProvider to every card mutation, forcing re-render of ALL children.
**Fix**: Change to `const cardCtx = useCardContext()` and only access `cardCtx.toggleTag` inside `handleToggleTag`. The `cards` destructure is not used anywhere in UIProvider — it's a leftover. Simply remove it:
```ts
const { toggleTag } = useCardContext();
```

### 2B. Split `useCards.ts` → `useCardStore` + `useCardIO`
**Decision**: After analysis, `useCards` is already well-decomposed into sub-hooks (`useCardCRUD`, `useCardAnnotations`, `useCategoryManagement`, `useCardImport`, `useCardExport`, `useCardBootstrap`). It serves as a thin orchestrator that wires them together. Splitting it further would create a circular dependency problem (IO needs the map setters, store needs IO for the return value). 

**Recommendation**: Skip this split — the orchestrator pattern is correct. The real win is fixing UIProvider (2A above), which eliminates the cascade. If we still want to split, we'd create `useCardIO` that returns `{importData, importCards, exportData, exportTemplate}` and consume it separately where needed, but the benefit is marginal since `useCards` already delegates.

---

## Task 3: Bulk Icon Migration (91 files)

Replace all `from "lucide-react"` barrel imports with deep imports across every file. Pattern:
```ts
// Before
import { ArrowLeft, Target } from "lucide-react";
// After  
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import Target from "lucide-react/dist/esm/icons/target";
```

Icon name mapping: PascalCase → kebab-case (e.g. `ChevronRight` → `chevron-right`, `AlertTriangle` → `alert-triangle`, `BookOpen` → `book-open`).

Files to update (all 91):
- Components: `AppOnboarding`, `AutoSplitDialog`, `Breadcrumbs`, `CardForm`, `CardList`, `CategoryManager`, `CognitiveAnalytics`, `Dashboard`, `DashboardChart`, `DashboardOnboarding`, `DocxImporter`, `EmptyState`, `ExamSidebar`, `ExportImportDialog`, `ForgettingCurve`, `GlobalSearch`, `HealthMonitor`, `InfoPanel`, `KnowledgeMap`, `LearnOnboarding`, `MainLayout`, `MajorSystemSettings`, `MetacognitiveCenter`, `MnemonicModule`, `MnemonicTest`, `MnemonicWorkshop`, `MyStats`, `NavLink`, `OnboardingModal`, `PomodoroTimer`, `ProcessingOverlay`, `RetentionChart`, `ReviewSession`, `RichTextEditor`, `ScrollableRow`, `SessionFilters`, `ShortcutsHint`, `SourceDiffView`, `SourceReader`, `SourceSnippetDialog`, `SRSettingsPanel`, `StrategicPlanner`, `TextSelectionTooltip`, `TopNav`, `ZenMode`
- Sub-components: `card-form/*`, `card-list/*`, `dashboard/*`, `knowledge-map/*`, `learn/*`, `mental-skeleton/*`, `mindmap/*`, `planner/*`, `review/*`, `source-reader/*`, `stats/*`, `workshop/*`
- Views: `CardsView`, `SourcesView`, `FrequentErrors`, and others
- Hooks/libs: `useDashboardData`, `review-constants`

This will be done file-by-file, each with the correct kebab-case icon path.

---

## Task 4: Fix Stale AppSettings (`useDashboardData.ts:90`)

**Problem**: `const appSettings = useMemo(() => loadAppSettings(), [])` — empty deps means settings never refresh.
**Fix**: Remove the empty-dep memo. Since `loadAppSettings()` reads localStorage synchronously and is cheap, call it directly at the top of the hook body (no memo needed — it runs once per render cycle anyway and is O(1)).

---

## Execution Order

| Step | What | Files |
|------|------|-------|
| 1 | Fix `recordDayDiscipline` → useEffect | `useDashboardData.ts` |
| 2 | Fix stale appSettings (remove empty memo) | `useDashboardData.ts` |
| 3 | Fix `queueSize` reactivity | `SessionContext.tsx` |
| 4 | Fix Electron IPC cleanup | `main.tsx` |
| 5 | Fix `importData` deps | `useCardImport.ts` |
| 6 | Fix UIProvider `cards` destructure | `AppContext.tsx` |
| 7-15 | Bulk deep-import migration (batched ~10 files per step) | 91 files |

## Guardrails
- No UI/layout changes
- No FSRS math changes
- `useCards.ts` orchestrator pattern preserved (already well-decomposed)
- All `dnd-kit` configs untouched

