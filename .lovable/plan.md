

# Design Unification: Forum ↔ Modern UI

## Overview
Four changes to make the Roman Forum feel like a native part of CODEX rather than a separate app: shared serif font, gold CSS variable, glassmorphism card styling, and persistent top navigation.

## 1. Shared Serif Font (Cinzel via Google Fonts)

**`index.html`**: Add a `<link>` for Cinzel from Google Fonts (weights 400, 600, 700).

**`src/index.css`**: Add a utility class `.font-display` with `font-family: 'Cinzel', 'Georgia', serif`. Also add a CSS custom property `--font-display: 'Cinzel', 'Georgia', serif` so components can reference it.

**`src/components/Dashboard.tsx`** (or `dashboard/DailyBriefing.tsx`): Apply `font-display` to the main dashboard greeting/title heading so the serif font appears in the modern UI too — creating a visual bridge.

**`src/views/RomanForumPage.tsx`** + **`ForumTransition.tsx`**: Replace inline `fontFamily: "'Georgia', 'Times New Roman', serif"` with `fontFamily: "var(--font-display)"` so they use Cinzel when loaded, Georgia as fallback.

## 2. Primary Gold CSS Variable

**`src/index.css`**: In every theme block (`:root`, `.dark`, and all `[data-theme]` variants), add:
```css
--gold: 43 74% 49%;
--gold-foreground: 0 0% 100%;
```
This gives a consistent warm gold (`hsl(43, 74%, 49%)` ≈ `#d4a843`) available everywhere.

**`tailwind.config.ts`**: Extend the `colors` config to include:
```ts
gold: "hsl(var(--gold))",
"gold-foreground": "hsl(var(--gold-foreground))",
```

This enables `text-gold`, `bg-gold`, `border-gold` etc. across both modern UI and Forum.

**Dark variants**: In `.dark` blocks, use a slightly brighter gold: `43 74% 55%`.

## 3. Glassmorphism Cards for Forum

**`src/index.css`**: Add a utility class:
```css
.glass-card {
  background: hsl(var(--card) / 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid hsl(var(--border) / 0.5);
  border-radius: var(--radius);
}
```

**`src/views/RomanForumPage.tsx`**: Apply `glass-card` class to the placeholder container instead of the current dashed border div. This establishes the pattern for Phase 2 monument cards.

## 4. Shared Top Navigation in Forum

Currently `RomanForumPage` renders inside `MainLayout` (which includes `TopNav`), so the nav is already present. The issue is the Forum page has its own back button that duplicates navigation.

**Fix**: Keep the `TopNav` visible (it already is via MainLayout). Remove the manual `ArrowLeft` back-link from `RomanForumPage` and instead make the page header a simple `FORVM IVSTITIAE` title that sits naturally below the existing nav — same pattern as every other page.

Add a subtle translucent backdrop to the Forum's content area header to give it the "floating" feel:
```tsx
<div className="sticky top-0 z-10 glass-card px-6 py-4 mb-6">
  <h1 className="text-2xl font-bold tracking-[0.15em] text-gold" style={{ fontFamily: "var(--font-display)" }}>
    FORVM IVSTITIAE
  </h1>
</div>
```

## Files Changed

| File | Change |
|------|--------|
| `index.html` | Add Cinzel Google Font link |
| `src/index.css` | Add `--gold`, `--font-display`, `.glass-card`, `.font-display` |
| `tailwind.config.ts` | Add `gold` color to theme |
| `src/views/RomanForumPage.tsx` | Use glass-card header, Cinzel font, gold color, remove back arrow |
| `src/components/gamification/ForumTransition.tsx` | Use `var(--font-display)` and `hsl(var(--gold))` |
| `src/components/dashboard/DailyBriefing.tsx` | Apply Cinzel to main greeting heading |

## Guardrails
- No FSRS, DB, or layout changes
- Standard barrel imports for icons
- TopNav stays untouched — Forum already renders inside MainLayout

