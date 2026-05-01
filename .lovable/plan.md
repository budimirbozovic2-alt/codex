## Goal

Two surgical UX fixes to `SubjectDashboard.tsx` (and one user-facing label in `ZettelkastenView.tsx`):

1. "Najčešće greške" doesn't belong in the **Baza i Izvori znanja** row — it isn't a knowledge source. Move it to the small icon-button cluster next to **Info / Podešavanja** in the header.
2. Rename **Zettelkasten** → **Lokalni Wiki** to align with the Croatian/Bosnian language used everywhere else in the app.

No other behavior, routing, or styling changes.

---

## Changes

### 1. `src/views/SubjectDashboard.tsx`

**A. Header icon cluster (around lines 152–183)**

Add a third small `Button variant="outline" size="icon" h-9 w-9` *before* Info and Podešavanja:

```text
[ AlertTriangle ]  [ Info ]  [ Settings ]
   Najčešće greške   Info     Podešavanja
```

- Icon: `AlertTriangle` (already imported).
- `asChild` + `<Link to={`/subject/${categoryId}/diagnostics`}>`.
- Tooltip: "Najčešće greške".
- `aria-label="Najčešće greške"`.

**B. "Baza i Izvori znanja" grid (lines 191–212)**

- Remove the `Najčešće greške` entry from `knowledgeBaseCards` (the 4th item, lines 117–122).
- Change grid from `grid-cols-4` to `grid-cols-3` so the remaining three cards (Lokalni Wiki, Izvori, Kartice) fill the row evenly at the current 1336px viewport.

**C. Rename label**

In `knowledgeBaseCards` (line 95), change `title: "Zettelkasten"` → `title: "Lokalni Wiki"`. Route stays `/subject/${categoryId}/zettelkasten` (internal slug untouched — no routing/storage churn).

**D. Cleanup**

`AlertTriangle` is already imported (line 6) — no import change needed since it's still used for the new header button. No other imports change.

### 2. `src/views/ZettelkastenView.tsx`

Line 407: rename the in-view header

```text
Zettelkasten — {categoryRec.name}   →   Lokalni Wiki — {categoryRec.name}
```

That is the only user-facing string in this file. Comments, function/file names, route slugs, storage keys, and types remain `Zettelkasten*` (internal vocabulary — renaming them would be a large, risky refactor outside the scope of this UX request).

---

## Out of scope (intentionally not touched)

- Route path `/subject/:categoryId/zettelkasten` (would break deep links and bookmarks).
- File names, hook names, storage keys, `db-schema.ts`, `backlink-index.ts`, `zettelkasten-tags.ts` — internal identifiers.
- `App.tsx` `ErrorBoundary label="Zettelkasten"` — diagnostic label, not user-facing copy.
- Any other dashboard widget or layout from the previous Phase refactors.
