## Problem

Legacy backupi (i ručno editovan JSON) često imaju `card.subcategoryId` / `card.chapterId` kao **string-name** vrijednosti — npr. `"1.a"`, `"2.b"`, `"Opći dio"`, `"Glava 3"` — umjesto stabilnih UUID-ova. Trenutni `useCardImport` (linije 56-57) ih bezuslovno snima:

```ts
subcategoryId: c.subcategoryId || c.subcategory || "",
chapterId: c.chapterId || c.chapter || "",
```

→ kartica završi sa raw stringom u IDB → prikazuje se kao zastarjela veza ili neraspoređena.

Cilj: konvertovati string-name vrijednosti u **trenutno-validne UUID-ove** prije nego se kartice persistiraju.

## Rješenje

Novi modul + integracija u jednu kritičnu tačku import flow-a. Postojeći `remap-from-backup` rješava **post-import** scenarij; ovo rješenje rješava **import-time** scenarij i sprečava da loši ID-evi uopšte stignu u IDB.

### 1. Novi fajl: `src/lib/migrations/resolve-legacy-taxonomy.ts` (~140 linija)

Eksportuje:

```ts
export function resolveLegacyTaxonomyNames(
  cards: CardLikeForResolve[],
  categoryRecords: CategoryRecord[],
): LegacyResolveReport
```

In-place mutira kartice. Algoritam po kartici:

1. **Subcategory**:
   - Ako trenutna vrijednost je validan UUID I postoji u `card.categoryId` strukturi → ostavi.
   - Inače: tretiraj string kao **ime**, traži match u `subcategories` te kategorije:
     - **(a) Egzaktan** match po normalizovanom imenu (`trim().toLowerCase()`).
     - **(b) Bidirektionalni substring** (`"opći" ⊂ "opći dio"` i obratno).
     - **(c) Tokenizovani prefiks** — uklanja `. , ; : ( ) - ` razmake, pa traži substring. Ovo hvata `"1.a"` → `"Glava 1.a"`, `"2.b"` → `"Pitanje 2.b"`.
   - Ako match → zamijeni UUID-om.
   - Ako fail → reset na `""` (kartica ostaje u kategoriji, postaje "Neraspoređena", konzistentno sa `heal-card-taxonomy`).

2. **Chapter**: isti postupak ali unutar liste glava odabrane podkategorije. Ako sub nije rezolviran → chapter se obavezno reset-uje (chapter bez sub-a je strukturno nemoguć).

3. Vraća izvještaj: `{scanned, resolvedSubcategory, resolvedChapter, unresolvedSubcategory, unresolvedChapter, alreadyValid}`.

UUID detekcija: standardni regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`.

Idempotentno — sigurno za višestruko pozivanje.

### 2. Integracija u `src/hooks/useCardImport.ts`

Tačka ubacivanja: **između** import-a kategorija (završava ~linija 194) i `schedulePersist` (linija 197).

```ts
// ── Resolve legacy string-name taxonomy → UUIDs ──
{
  const { idbLoadCategories } = await import("@/lib/db");
  const freshRecs = await idbLoadCategories();
  const { resolveLegacyTaxonomyNames } = await import("@/lib/migrations/resolve-legacy-taxonomy");
  const report = resolveLegacyTaxonomyNames(merged, freshRecs);
  // Sinhronizuj nextMap (drži iste reference ali eksplicitno):
  for (const c of merged) nextMap[c.id] = c;
  if (report.resolvedSubcategory + report.resolvedChapter > 0) {
    extraParts.push(
      `Mapirano legacy imena: ${report.resolvedSubcategory} podkat., ${report.resolvedChapter} glava.`
    );
  }
  if (report.unresolvedSubcategory + report.unresolvedChapter > 0) {
    extraParts.push(
      `Bez para (resetovano): ${report.unresolvedSubcategory} podkat., ${report.unresolvedChapter} glava.`
    );
  }
}

// ── Persist cards AFTER remap is complete ──
if (merged.length > 0) schedulePersist({ type: "bulk", cards: merged });
```

Bitno: poziva se **nakon** što su nove kategorije bulkPut-ane i remap UUID-ova kategorija završen, tako da `freshRecs` sadrži kompletnu strukturu na kojoj treba match-ovati imena.

### 3. Toast poruka

Postojeći `extraParts` niz (linija ~363) već sklapa dodatne info-stringove u finalni toast. Dodajemo dvije linije: koliko je rezolvirano, koliko je resetovano. Korisnik ima jasan signal šta se desilo.

## Garancije

- **Sigurno**: ne dira `question`, `sections`, `categoryId`, FSRS state, tagove.
- **Sprečava trovanje IDB-a**: legacy stringovi nikad ne stignu u `db.cards`.
- **Komplementarno**:
  - `resolveLegacyTaxonomyNames` (novo) → import-time prevention.
  - `heal-card-taxonomy` (postoji) → boot-time cleanup za već zaprljanu bazu.
  - `remap-from-backup` (postoji) → manualni recovery preko UI-a.
- **Idempotentno**: ponovni import istih podataka ne radi ništa.
- **Ne pogoršava**: kada match potpuno fail-uje → reset, isto ponašanje kao trenutno za "Neraspoređene", ali bez raw UUID/string-a u UI-u.

## Fajlovi

- **Novo**: `src/lib/migrations/resolve-legacy-taxonomy.ts`
- **Izmjena**: `src/hooks/useCardImport.ts` — ~10 linija dodano između linije 194 i 197.