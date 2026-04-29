## Goal

Three small but important cleanups to lock in the Subject-Centric PKM architecture: scope local "Konsolidacija znanja" to the current subject, strip card-management features out of the Sources view, and confirm global tools stay in the sidebar (no action needed there beyond verification).

---

### 1. Fix Local Consolidation scoping

**Problem**: `SubjectDashboard.tsx` builds the link as `/review?cat=${categoryId}`, but `ReviewPage.tsx` reads `searchParams.get("category")` — the `cat` key is silently ignored, so clicking "Konsolidacija znanja" actually launches a **global** review instead of a subject-scoped one.

**Fix**: Change the link in `SubjectDashboard.tsx` (line 118) from `?cat=${categoryId}` to `?category=${categoryId}` so it matches the existing reader in `ReviewPage.tsx`. Also clarify the helper text to read "Ponavljanje dospjelih kartica iz ovog predmeta".

No changes to `ReviewPage.tsx` are needed — it already supports `?category=`.

### 2. Clean up the Sources View (`CategoryView.tsx`)

The view currently still mixes three concerns: raw sources, knowledge map, and structure management. Per the new architecture (knowledge map lives in `SubjectDashboard` / Zettelkasten, structure lives in the dedicated `SubjectCardsView` "Struktura" tab), strip everything that is not source reading/management.

Concretely in `src/views/CategoryView.tsx`:

- **Remove** the header buttons "Mapa znanja" and "Struktura".
- **Remove** the `showKnowledge`, `kmSubcategory`, `kmSearch`, `structureOpen` state and related handlers.
- **Remove** the `MentalSkeleton` lazy import and the `<SubcategoryList>` / `<MentalSkeleton>` rendering branches.
- **Remove** the `<StructureManagerDialog>` instance and the related `addSubcategory`/`renameSubcategory`/etc. destructured actions from `useCardActions()`.
- **Keep** the mastery-distribution progress bar (purely informational about the source corpus' coverage).
- **Keep** the `<SourcesTab>` rendering and the full-screen `<SourceReader>` flow (and the GlobalSearch auto-open effect).
- **Keep** `bulkFlagNeedsReview` since `SourcesTab` consumes it.

Result: `CategoryView` becomes a thin shell whose only job is "list/manage sources for this subject + open the source reader".

### 3. Global Tools — verification only

`src/components/AppSidebar.tsx` already lists, under the "Alati" group:
- `/mnemonics` — Memorizacija (Mnemonička radionica)
- `/speed-reader` — Speed Reader
- `/mind-map` — Mentalne mape
- `/planner` — Strateški planer

No code changes here. The sidebar already presents them globally; we will not add subject-local copies.

We will also leave `MnemonicModule` embedded inside `SubjectCardsView` "Mnemonika" tab as is (it is a contextual helper for editing cards, not a competing global engine — confirmed by past task notes). No new local engines for Speed Reader, Mind Maps, or Planner will be added to `SubjectDashboard`.

---

### Files to edit

- `src/views/SubjectDashboard.tsx` — switch `?cat=` → `?category=`, tweak helper copy
- `src/views/CategoryView.tsx` — strip Mapa znanja + Struktura UI, dialogs, lazy imports, and unused state/actions

### Files NOT touched

- `src/views/ReviewPage.tsx` — already filters by `?category=`
- `src/components/AppSidebar.tsx` — already exposes all four global tools

### Risk / regressions

- No DB or context-shape changes.
- `StructureManagerDialog` and `MentalSkeleton` remain accessible from `SubjectCardsView` and `SubjectDashboard` respectively; removing them from `CategoryView` does not orphan them.
- The auto-open-source-from-GlobalSearch effect is preserved.
