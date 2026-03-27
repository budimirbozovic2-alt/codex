

# Remove font-display (Cinzel) — Use font-sans Universally

## What
Remove all `font-display` class usage across the entire codebase. Every element currently using Cinzel will use the default `font-sans` (DM Sans) instead.

## Changes

### 1. Remove `font-display` class from 27 component files
Strip the `font-display` className from every occurrence. The affected files and their usages:

| File | Elements |
|------|----------|
| `CategoryManager.tsx` | h2 title |
| `CardForm.tsx` | h2 title |
| `MetacognitiveCenter.tsx` | h2 title |
| `ReviewComplete.tsx` | h2 title |
| `ModeSelector.tsx` | h2 title |
| `ForumTransition.tsx` | h1 cinematic text |
| `CardsView.tsx` | h2 title |
| `SpeedReader.tsx` | h2 title |
| `RomanForumPage.tsx` | h1 "FORUM ZNANJA" |
| `ForgettingCurve.tsx` | h2 title |
| `DocxImporter.tsx` | DialogTitle |
| `MnemonicWorkshop.tsx` | h2 title |
| `ErrorBoundary.tsx` | h2 title |
| `MyStats.tsx` | h2 title |
| `MnemonicModule.tsx` | h2 title |
| + ~12 more files | Various headings |

### 2. Clean up CSS definition (`src/index.css`)
- Remove the `--font-display` CSS variable (line 30)
- Remove the `.font-display` utility class block (lines 682-685)

### 3. Remove Cinzel font import (`index.html`)
- Remove the Google Fonts `<link>` for Cinzel (line 15)
- Remove the two `<link rel="preconnect">` for Google Fonts (lines 13-14) since no other Google Font is used

### 4. Tailwind config — no changes needed
`font-display` is not defined in `tailwind.config.ts` — it's a custom CSS class, so removing it from `index.css` is sufficient.

## Result
Every heading and label renders in DM Sans (`font-sans`). Zero Cinzel references remain. Zero logic changes.

