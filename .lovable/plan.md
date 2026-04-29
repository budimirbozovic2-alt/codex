# Card search + subcategory/chapter filtering on `/subject/:categoryId/cards`

The "Pregled" tab in `SubjectCardsView` already has:

- A **search input** (top filter row) — placeholder "Pretraži pitanja, odgovore, tagove..." — fed into `CardViewMode` via `externalQuery`.
- A **source filter** (top filter row).
- A second filter bar (`CardViewFilterBar`) rendered by `CardViewMode` containing **Potkategorija** and **Glava** selects driven by `useCardViewFilters`.

So subcategory/chapter filtering is already present and functional. The single real gap: the search haystack in `useCardViewFilters` covers question + section title/content but **not tags**, which contradicts the placeholder copy ("...tagove...").

## Single-file change

`src/hooks/useCardViewFilters.ts` (lines 80–86): extend the haystack with the card's tags so search by tag actually works.

```ts
if (normalizedQuery) {
  const hay =
    (c.question ?? "").toLowerCase() +
    " " +
    (c.sections ?? []).map(s => `${s.title ?? ""} ${s.content ?? ""}`).join(" ").toLowerCase() +
    " " +
    (c.tags ?? []).join(" ").toLowerCase();
  if (!hay.includes(normalizedQuery)) return false;
}
```

## What is *not* changed and why

- **No new search/filter UI** in `SubjectCardsView.tsx` — the requested controls already exist (`searchQuery` Input + `CardViewFilterBar` Selects). Adding duplicate Potkategorija/Glava selects at the top would shadow the ones in the filter bar and split state across two sources of truth.
- **No memory entry** — small bug-fix style change to an existing documented feature.

## Verification

After the change, typing a tag like `proceduralno` in the Pregled search box matches cards whose `tags` array contains it, in addition to question/content matches. Subcategory and Glava continue to filter via the existing selects in the row beneath.
