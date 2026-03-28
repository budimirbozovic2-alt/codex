

# Imperial UI/UX Design System Unification

## Overview

Four tasks to unify typography, strip redundant navigation, relocate misplaced features from Settings, and reorganize the Settings panel into a clean 4-tab structure.

---

## Task 1: Global Typography & Imperial Branding

**Problem**: H1 titles vary wildly — `text-2xl font-bold`, `text-3xl font-bold`, `text-2xl font-semibold` — across pages. No golden imperial style outside the Forum.

**Fix**: Define a reusable imperial heading style in `index.css` and apply it consistently.

### CSS addition (`src/index.css`)
Add a `.imperial-title` utility class:
- `font-family: 'Cinzel', serif` (with DM Sans fallback)
- `text-[hsl(var(--gold))]` color
- `tracking-wide`, `text-2xl font-bold` (standardized size)
- Add Cinzel `@font-face` or Google Fonts import

### Component updates (heading standardization)
All main page titles (H1) get the imperial class. H2 section titles stay `text-lg font-semibold`. H3 card-level headers stay `text-sm font-semibold`.

| File | Current H1 | Change |
|---|---|---|
| `CategoryView.tsx:131` | `text-2xl font-bold` | → `imperial-title` |
| `SRSettingsPanel.tsx:82` | `text-2xl font-semibold` | → `imperial-title` |
| `MyStats.tsx:48` | `text-3xl font-bold` | → `imperial-title` |
| `StrategicPlanner.tsx:33` | `text-3xl font-bold` | → `imperial-title` |
| `MetacognitiveCenter.tsx:44` | `text-3xl font-bold` | → `imperial-title` |
| `MnemonicWorkshop.tsx:107` | `text-3xl font-bold` | → `imperial-title` |
| `MnemonicTest.tsx:151,265,298` | `text-3xl font-bold` | → `imperial-title` |
| `SpeedReader.tsx:414` | `text-3xl font-bold` | → `imperial-title` |
| `CardForm.tsx:37` | `text-3xl font-bold` | → `imperial-title` |
| `KnowledgeMap (SharedWidgets):19` | `text-2xl font-semibold` | → `imperial-title` |
| `MajorSystemSettings.tsx:35` | `text-3xl font-bold` | → `imperial-title` |
| `ReviewSetup.tsx` | find H1 | → `imperial-title` |
| `learn/ModeSelector.tsx` | find H1 | → `imperial-title` |
| `learn/FilterSetup.tsx` | find H1 | → `imperial-title` |

---

## Task 2: Remove "Back" Buttons & Unify Shell

**Problem**: Almost every view has a manual `<ArrowLeft> Nazad` button that duplicates sidebar navigation.

**Fix**: Remove `onBack` usage from top-level page headers. Keep `onBack` only in sub-views (e.g., SourceReader returning to category, ReviewCard returning to ReviewSetup, MindMapCanvas returning to list, learn session steps).

### Remove `onBack` from page-level headers

| File | Action |
|---|---|
| `SRSettingsPanel.tsx:79-81` | Remove ArrowLeft/Nazad button; remove `onBack` prop |
| `MyStats.tsx:43-45` | Remove back button |
| `StrategicPlanner.tsx:28-30` | Remove back button |
| `MetacognitiveCenter.tsx:41-43` | Remove back button |
| `MnemonicWorkshop.tsx:103-106` | Remove back button |
| `MnemonicModule.tsx` | Remove `onBack` prop pass-through |
| `MajorSystemSettings.tsx:32-34` | Remove back button |
| `KnowledgeMap.tsx` | Remove back button in header |
| `learn/ModeSelector.tsx:88-90` | Remove back button |
| `FrequentErrors` (in FrequentErrors.tsx) | Remove back button if present |

Also update all calling `*Page.tsx` views to stop passing `onBack` where it's no longer needed as a prop.

### Keep `onBack` (sub-view navigation — NOT page-level)
- `SourceReader` → returns to category sources tab
- `ReviewCard` → returns to ReviewSetup
- `MindMapCanvas` → returns to map list
- `learn/SessionHeader` → exits active session
- `learn/FilterSetup` → back to mode selector (sub-step, not page)
- `CategoryMindMaps` → back to gallery from viewer
- `OnboardingModal` → step navigation

---

## Task 3: Settings Purge — Relocate HealthMonitor & FSRS Guide

**Problem**: HealthMonitor (DB diagnostics) and FSRS algorithm guide are buried in Settings where users never find them contextually.

### Move HealthMonitor to Stats
- Remove `<HealthMonitor />` from `SRSettingsPanel.tsx` (line 464)
- Add a new "Zdravlje baze" tab or section in `MyStats.tsx` under Stats, importing and rendering `HealthMonitor` there (fits with the "Laboratorija" concept)

### Move FSRS Guide to Review/Learn context
- Remove the entire FSRS guide section from `SRSettingsPanel.tsx` (lines 466-590 — the "Kako ocjene rade" card + "Kako radi FSRS — vodič" collapsibles)
- Add it as an `InfoPanel` or a `Dialog` triggered by an info icon in `ReviewSetup.tsx` (where grade explanations are contextually relevant)
- Create a small `FSRSGuide.tsx` component extracted from the removed JSX for reuse

---

## Task 4: Settings Re-organization (4 Clean Tabs)

**Current**: 5 tabs (Algoritam, Interfejs, Tok rada, Sistem, Predmeti)

**New structure**: 4 tabs

| Tab | Content |
|---|---|
| **Personalizacija** | Theme picker + Dashboard widgets + Sound effects (moved from Interfejs) |
| **Tok rada** | Pomodoro + TTS + Notifications + Backup reminder (stays) |
| **Algoritam** | Target retention + FSRS weights + Leech threshold + Daily goal (stays) |
| **Sistem** | Backup/Restore + Predmeti (CategoryManager) — merged |

Changes in `SRSettingsPanel.tsx`:
- Rename "Interfejs" tab → "Personalizacija"
- Merge "Predmeti" tab content into "Sistem" tab (below Backup/Restore)
- Remove HealthMonitor and FSRS guide from "Sistem" tab
- Result: `grid-cols-4` instead of `grid-cols-5`

---

## File Change Summary

| File | Changes |
|---|---|
| `src/index.css` | Add `.imperial-title` class + Cinzel font import |
| `src/components/SRSettingsPanel.tsx` | Remove back button, remove HealthMonitor, remove FSRS guide, restructure to 4 tabs, rename Interfejs→Personalizacija, merge Predmeti into Sistem |
| `src/views/SettingsPage.tsx` | Remove `onBack` prop passing |
| `src/components/MyStats.tsx` | Remove back button, add imperial title, add HealthMonitor tab |
| `src/components/StrategicPlanner.tsx` | Remove back button, add imperial title |
| `src/components/MetacognitiveCenter.tsx` | Remove back button, add imperial title |
| `src/components/MnemonicWorkshop.tsx` | Remove back button, add imperial title |
| `src/components/MnemonicModule.tsx` | Remove `onBack` prop |
| `src/components/MajorSystemSettings.tsx` | Remove back button, add imperial title |
| `src/components/SpeedReader.tsx` | Add imperial title |
| `src/components/CardForm.tsx` | Add imperial title |
| `src/components/KnowledgeMap.tsx` | Remove back button |
| `src/components/knowledge-map/SharedWidgets.tsx` | Add imperial title |
| `src/components/learn/ModeSelector.tsx` | Remove back button, add imperial title |
| `src/components/learn/FilterSetup.tsx` | Add imperial title |
| `src/components/review/ReviewSetup.tsx` | Add imperial title + FSRS guide info trigger |
| `src/views/CategoryView.tsx` | Add imperial title |
| `src/views/MnemonicPage.tsx` | Remove `onBack` prop |
| `src/views/StatsPage.tsx` | Remove `onBack` prop |
| `src/views/KnowledgeMapPage.tsx` | Remove `onBack` prop |
| `src/views/PlannerPage.tsx` | Remove `onBack` prop |
| `src/views/MetacognitivePage.tsx` | Remove `onBack` prop |
| `src/views/FrequentErrorsPage.tsx` | Remove `onBack` prop |
| `src/views/MajorSystemPage.tsx` | Remove `onBack` prop |
| **NEW** `src/components/FSRSGuide.tsx` | Extracted FSRS explanation component |

