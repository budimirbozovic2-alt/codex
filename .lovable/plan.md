# PR-E3a — Drain `react-refresh/only-export-components` + `react-hooks/exhaustive-deps` warnings

## Goal

Get `npm run lint` to 0 warnings of these two rules so PR-E3 can flip `--max-warnings=80` → `0`. Strictly warning cleanup; no behavior changes. The 45 pre-existing **errors** in the codebase (empty-block, prefer-const, no-useless-escape, etc.) are out of scope — they will be tackled in PR-E3b. (`--max-warnings` doesn't gate errors; errors already break the build.)

## Baseline

- **only-export-components**: 26 warnings across 10 files
- **exhaustive-deps**: 21 warnings across 18 files
- Plus 4 stale `Unused eslint-disable directive` lines to remove while we're in there.

## Strategy

### Group A — `react-refresh/only-export-components` (26 warnings)

Three buckets, each handled with the appropriate tool:

**A1 — shadcn primitives** (`badge.tsx`, `button.tsx`, `sidebar.tsx`, `sonner.tsx`): the rule fires because shadcn's canonical pattern co-exports `cva` variant configs (e.g. `buttonVariants`) and provider context hooks alongside the component. This is intentional and matches every shadcn project. **Fix**: add a single override block in `eslint.config.js` that disables `react-refresh/only-export-components` for `src/components/ui/**`. HMR boundary loss is irrelevant for leaf primitives.

**A2 — barrel-style contexts** (`src/contexts/AppContext.tsx`): the file is an intentional re-export barrel (lines 28-52 re-export ~10 hooks from `@/hooks/*`). Splitting would touch dozens of import sites with zero functional benefit. **Fix**: add a single `/* eslint-disable react-refresh/only-export-components */` at the top of `AppContext.tsx` with a comment explaining the barrel rationale. (Per-file disable, not config-level — keeps the rule honest for future contexts.)

**A3 — project files where splitting is clean** (5 files):

- `src/components/OnboardingModal.tsx` — extract `OnboardingSlide` type, `hasSeenOnboarding()`, `markOnboardingSeen()` into a sibling `OnboardingModal.helpers.ts`. Update the 2-3 import sites.
- `src/components/mindmap/MindMapNode.tsx` — extract `ICON_REGISTRY`, `COLOR_OPTIONS`, `NodeShape`, `MindMapNodeData` into `MindMapNode.constants.ts`.
- `src/components/mindmap/MindMapOnboarding.tsx` — extract `hasSeenOnboarding()` into `MindMapOnboarding.helpers.ts`.
- `src/components/mindmap/mindmap-utils.tsx` — file contains one JSX component (`SnapGuideLines`) + one pure function (`autoLayout`). Move `autoLayout` to `mindmap-utils.ts` (pure file), keep `SnapGuideLines` in the `.tsx`.
- `src/components/planner/planner-constants.tsx` — contains `STATUS_CONFIG`, `PHASE_COLORS` (constants) and `ChartTooltip` (component). Move constants to `planner-constants.ts` (rename the existing file), keep `ChartTooltip` in `ChartTooltip.tsx`. Update all import sites (grep first).

### Group B — `react-hooks/exhaustive-deps` (21 warnings)

Each warning gets one of three treatments, decided by reading the site:

**B1 — Remove genuinely unnecessary deps** (the lint suggests "remove"):
- `useCardExport.ts:242` — drop `cards`.
- `useCardImport.ts:189` — drop `updateSRSettings` (it's a setter from outer scope).
- `useDashboardData.ts:102` — drop `settingsVersion`.
- `useCardDraft.ts` (`card.id`, `section.id` unnecessary deps) — drop them.

**B2 — Add genuinely missing deps** (safe to include):
- `useSourceMapping.ts:103, 147` — add `commitMapping`.
- `useMindMapCanvas.ts:174` — add `edgeStyle`.
- `SmartSplitSummaryDialog.tsx:148` — add `uuidToName`.
- `LocalSpeedReader.tsx:157` — add `commitSave`.
- `SubjectCardsView` (`tree` missing) — add `tree`.
- `PredictionTab.tsx:46` — add `catNameMap`.
- `useActions.ts` — add `annotations`, `crud`, `actions`, `exportApi`, `importApi` (these are stable context references; verify they aren't recreated each render — if they are, wrap upstream in `useMemo`).

**B3 — Suppress with justification** (refs/intentional escape hatches): use `// eslint-disable-next-line react-hooks/exhaustive-deps` with a one-line `// Reason:` comment.
- `useWikiLinkAutoCreate.ts:196` — `bulkCreateRef` is a `useRef`; refs don't need deps.
- `ReviewSetup.tsx:60` — `sel.current` ref mutation.
- `GlobalSearch.tsx:132` — 5 refs (`appRef`, `localRef`, `overridesEnabledRef`, `subjectNameRef`, `ttsRef`).
- `CardOrgMode.tsx:53/SourceEditor.tsx:53` — "logical expression makes deps change" → wrap the upstream `sections`/`subcategories` derivation in `useMemo` (this is the suggested fix).
- `ReviewCard.tsx:71` — drop `card.id`/`section.id` per the message (B1 actually).
- `StudyModeRecall.tsx:152` — wrap `itemsByMode` in `useMemo` per the suggestion.
- `SRSettingsPanel.tsx:28` — already-disabled but `Unused eslint-disable`; remove the stale directive.

### Group C — Stale `eslint-disable` directives (4)

Delete the unused directives flagged by ESLint:
- `src/lib/persist-queue.ts:268` — unused `no-var` disable.
- `src/lib/repositories/reviewLogRepository.ts:50` — unused `no-var` disable.
- `src/test/perf/cards-query-bench.test.ts:68` — unused `no-console` disable.
- `src/hooks/cards/useActions.ts:28` (or similar) — unused `exhaustive-deps` disable.

## Implementation order

1. **A1**: add `src/components/ui/**` override block to `eslint.config.js` disabling `react-refresh/only-export-components`.
2. **A2**: header-disable in `AppContext.tsx`.
3. **A3**: split 5 project files; update import sites (use `rg` to find them first).
4. **B1-B3**: walk each of the 18 files, apply the appropriate fix from above. Verify each change still type-checks and tests still pass.
5. **C**: remove 4 stale directives.
6. **Verify**: `npx eslint . --max-warnings=0` exits cleanly w.r.t. those two rules. (45 pre-existing errors will still surface — out of scope; PR-E3b will handle them. We confirm count of these two specific warnings = 0 via `npx eslint . 2>&1 | grep -cE "only-export-components|exhaustive-deps"`.)
7. **Tests**: `bunx vitest run` → 604/604 must remain green.
8. **Typecheck**: `npx tsc -p tsconfig.app.json --noEmit` → 0 errors.

## Risk

Low-medium. B2 fixes ("add missing dep") can trigger re-render loops if the dep isn't actually stable upstream. Mitigation: where the suggested dep is a function/object from props/context, we verify it's memoized; if not, we wrap upstream first or fall back to B3 (suppress with reason).

A3 file splits move declarations between files — risk is import path churn. Mitigation: grep all import sites before each split; verify tests + tsc after each file.

## Out of scope

- 45 pre-existing **errors** (empty-block, prefer-const, no-useless-escape, no-empty-object-type, no-restricted-imports `knowledge-base`, no-require-imports in tailwind.config.ts). Tracked for PR-E3b.
- Flipping `--max-warnings=80` → `0` in `package.json`. Done by PR-E3b once errors are also clean.

## Files touched (~30)

- `eslint.config.js` (A1 override)
- `src/contexts/AppContext.tsx` (A2 header)
- 5 file splits + their import sites (A3)
- 18 hook sites (B1-B3)
- 4 stale-directive removals (C)
