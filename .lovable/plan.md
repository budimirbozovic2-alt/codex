

# Forum Iustitiae — Batch 1: Foundation

## Overview
Create the easter egg unlock system, transition animation, and `/forum` route. After this batch, the "ritual" (triple-click logo + Light→Dark→Light theme toggle) triggers a cinematic transition to a blank Forum page.

## New Files

### 1. `src/components/gamification/ForumContext.tsx`
React context providing:
- `unlocked: boolean` — persisted in `localStorage` key `codex-forum-unlocked`
- `showTransition: boolean` — controls the entry animation
- `enterForum()` — sets `unlocked=true`, `showTransition=true`, saves to localStorage
- `exitForum()` — navigates back to `/`
- `forumReady()` — called after transition ends, navigates to `/forum`, sets `showTransition=false`

Wrap this provider inside `App.tsx` around the `HashRouter` block (above `AppProvider`).

### 2. `src/components/gamification/ForumTransition.tsx`
Full-screen fixed overlay (`z-[9999]`), rendered when `showTransition=true`:
- Phase 1 (0–500ms): Fade to black
- Phase 2 (500–2500ms): Gold serif text "CIVIS ROMANVS SVM" fades in and holds
- Phase 3 (2500–3000ms): Everything fades out
- On complete: call `forumReady()` from context

Uses CSS `@keyframes` defined inline or in `index.css`. Text styled with `font-family: 'Georgia', serif`, gold color `#d4a843`, `letter-spacing: 0.3em`.

### 3. `src/views/RomanForumPage.tsx`
Simple placeholder page:
- "FORVM IVSTITIAE" heading
- Back button to `/`
- Centered in `max-w-6xl mx-auto`

## Modified Files

### 4. `src/components/TopNav.tsx`
Modify the existing `_handleThemeSeq` logic. Currently phase 3 triggers the `_sysInfoOpen` dialog. Change it so:
- Phase 3 completion calls `enterForum()` from `ForumContext` instead of (or in addition to) the sys info dialog
- Import and use `useForumContext` from the new context
- The existing `_handleBrandClick` (single click on brand) already sets phase 1 — keep that
- The existing `_seqRef` / `_resetSeq` pattern is reused — just change the phase 3 action

### 5. `src/App.tsx`
- Add `ForumProvider` wrapper (inside `QueryClientProvider`, outside `HashRouter`)
- Add lazy import for `RomanForumPage`
- Add `<Route path="/forum" ...>` alongside other routes
- Render `<ForumTransition />` outside the router (fixed overlay)

### 6. `src/index.css`
Add keyframes for the transition:
- `@keyframes forum-fade-in` (opacity 0→1)
- `@keyframes forum-fade-out` (opacity 1→0)
- `@keyframes forum-text-glow` (subtle gold pulse)

## Execution Order
1. Create `ForumContext.tsx`
2. Create `ForumTransition.tsx`
3. Create `RomanForumPage.tsx`
4. Update `App.tsx` (provider + route + transition)
5. Update `TopNav.tsx` (phase 3 → enterForum)
6. Add CSS keyframes to `index.css`

## Guardrails
- Standard barrel imports for all icons
- No FSRS/DB/layout changes
- TitleBar.tsx unchanged (TopNav already handles the brand click + theme sequence)
- The existing sys-info easter egg can remain as a secondary feature (double-click brand)

