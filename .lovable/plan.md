

# Plan: Učenje i Konsolidacija — poštuj `sortOrder` glava i potkategorija

## Dijagnoza

Korisnikov manuelni redoslijed iz **Strukture predmeta** (`sortOrder` na `SubcategoryNode` i `ChapterNode`) se ne primjenjuje u Učenju ni Konsolidaciji:

1. **`SessionFilters.tsx:62-68`** — pillovi glava se sortiraju **alfabetski po nazivu** (`localeCompare`).
2. **`useCards.ts:34-42`** — derivacija `subcategories: Record<string, string[]>` čita iz `categoryRecords` direktno bez explicit sortiranja po `sortOrder`. Trenutno nekad radi (DB redoslijed), ali nije garantovano poslije reorder-a.
3. **`ReviewSetup.tsx:130-134`** — `dueChapters` koristi `Array.from(...).sort()` što sortira po UUID stringu (random redoslijed).
4. **`LearnSession.sortedCards`** — kad je `sortMode === "order"`, sortira se po `subPos`/`chapPos` koje **dolaze iz `sortOrder`-a** — ovo radi ispravno, ali pillovi za **filter** (gdje korisnik bira koju glavu otvoriti) prikazuju ih pogrešnim redoslijedom.

## Rješenje: jedinstven izvor istine — `sortOrder`

### 1. `src/hooks/useCards.ts` — sortiraj potkategorije pri derivaciji
U `subcategories` memo, prije mapiranja na ID-ove dodaj sort po `sortOrder`:
```ts
map[r.id] = [...(r.subcategories || [])]
  .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  .map(n => typeof n === "string" ? n : n.id);
```

### 2. `src/components/SessionFilters.tsx` — sortiraj glave po `sortOrder` iz `categoryRecords`
Zamijeni `chaptersInSub` memo da koristi UUID → `sortOrder` mapu izgrađenu iz `categoryRecords`:
```ts
const chapterPosMap = useMemo(() => {
  const m: Record<string, number> = {};
  for (const r of categoryRecords || [])
    for (const sub of r.subcategories || [])
      (sub.chapters || []).forEach((ch, i) =>
        m[typeof ch === "string" ? ch : ch.id] = typeof ch === "string" ? i : (ch.sortOrder ?? i)
      );
  return m;
}, [categoryRecords]);

const chaptersInSub = useMemo(() => {
  if (!selectedSubcategory) return [];
  return Array.from(new Set(
    cards.filter(c => c.categoryId === selectedCategory && c.subcategoryId === selectedSubcategory && c.chapterId)
      .map(c => c.chapterId!)
  )).sort((a, b) => (chapterPosMap[a] ?? 999) - (chapterPosMap[b] ?? 999));
}, [cards, selectedCategory, selectedSubcategory, chapterPosMap]);
```

### 3. `src/components/review/ReviewSetup.tsx` — `dueChapters` koristi isti princip
Ovaj memo se pravi lokalno, ali rezultat se ne koristi za UI direktno (pillovi idu kroz `SessionFilters` koji sad ima vlastitu logiku). **Provjera:** `dueChapters` se zapravo nigdje ne renderuje u JSX-u — može se ukloniti (dead code) ili ostaviti netaknuto. Ostavljam netaknuto, uklanjanje van scope-a.

### Što NE diram
- `SortMode === "order"` u `LearnSession` (već radi ispravno preko `positionMaps`).
- Strukturu, drag&drop, persistenciju `sortOrder`-a — sve ostaje.
- `ReviewSetup.dueSubcategories` (alfa po UUID, ali pillovi idu kroz `SessionFilters` → riješeno automatski).

## Fajlovi
- `src/hooks/useCards.ts` — 3 linije (sort u memo)
- `src/components/SessionFilters.tsx` — ~12 linija (novi `chapterPosMap` memo + izmjena `chaptersInSub`)

Ukupno: **2 fajla**, ~15 izmijenjenih linija. Nakon primjene, glave i potkategorije u Učenju i Konsolidaciji prate redoslijed iz Strukture predmeta.

