## Cilj

Sanirati 4 mjesta koja postaju nepodnošljiva s rastom baze:

1. **B1** — Razbijanje `useCardActions` "God-Object" hooka na 3 fokusirana sub-hooka.
2. **A2** — Backlinks O(N×C) regex skeniranje → in-memory backlink indeks (BroadcastChannel sync).
3. **A3** — Zamjena `JSON.stringify` poređenja sa strukturalnim komparatorima (Set/sortirano) na 4 mjesta gdje pravi "false dirty" + nepotrebne IDB write-ove.
4. **B11+B12** — Post-save UX: bulk "Sačuvaj i dodaj sljedeću" + jasna post-save navigacija.

---

## 1. B1 — Razbijanje `useCardActions`

**Problem:** Hook vraća 25+ vrijednosti i miješa tri orthogonal nezavisna domena (sadržaj/UI/metadata/submit). Svaki keystroke u `question` setteru invalidira sve `useMemo`-e u potrošačima koji konzumiraju "cijeli" `a`. Pošto `CardForm` destrukturira `const a = useCardActions(...)` i prosljeđuje `a.*` u `MetadataSection` i `EditorSection`, izmjena bilo kojeg polja editora trigeruje re-render `MetadataSection`-a (i obrnuto).

**Rješenje — 3 sub-hooka + tanki barrel:**

| Hook | Šta drži | Tipičan re-render trigger |
|---|---|---|
| `useCardContent` | `cardType`, `question`, `flashAnswer`, `sections`, section actions (add/remove/move/cut), validation errors, `cuttingIndex` | tipkanje u editoru |
| `useCardMetadata` | `categoryId`, `subcategoryId`, `chapterId`, `newCategory/Sub/Chapter`, `show*`, `frequencyTag`, `sourceType`, `availableSubs`, `availableChapters`, `linkedGazetteInfo` | promjena dropdown-a |
| `useCardSubmit` | `handleSubmit`, `isSaving`, integrira `clearDraft`, `formWidth`, `setFormWidth`, draft autosave (B9) — koristi snapshot iz prva dva | submit + width toggle |

**Barrel `useCardActions`** ostaje (back-compat za jedinog consumera `CardForm`) ali interno zove tri sub-hooka. Vraća isti shape API kako bi `CardForm` migracija bila trivial.

**Optimizacija u CardForm-u:** uvodimo `MetadataSection` i `EditorSection` da primaju **samo svoju** isječnu propsu (ne destrukturiranu cijelu `a`). `React.memo` na obje sekcije spriječava unakrsne re-rendere kad bilo koji prop ne uđe u njihov scope.

**Mjera uspjeha:** Tipkanje u sekciji eseja → `MetadataSection.render` se ne poziva (ručno verifikovano u test renderu sa render-counter ref-om).

---

## 2. A2 — Backlinks indeks (in-memory + sync)

**Problem:** `findBacklinks` u `BacklinksPanel` skenira **svih N članaka** sa regex-om za **svaki** otvoreni članak (C otvaranja). Na 1k članaka × prosjek 5kB sadržaja = 5MB regex-a po otvaranju → main thread freeze.

**Rješenje — globalni reverzni indeks `Map<normalizedTitle, Set<articleId>>`** + `Map<articleId, snippetByTarget>`:

- Novi modul `src/lib/backlink-index.ts`:
  - Singleton store sa metodama: `rebuildFromAll(articles)`, `upsertArticle(article)`, `removeArticle(id)`, `getBacklinks(targetTitle, targetId)`.
  - Pri `upsert`: parsiraj `[[...]]` linkove iz sadržaja, izračunaj snippete (40 char prozor), update reverse mapu.
  - Subject-aware: indeksi su per `subjectId` (Map<subjectId, IndexState>) jer su Zettelkasten artikli scoped po subjektu (Core: scoping bounded by categoryId).
  - Sluša `BroadcastChannel` event-bus događaj `kb-article:upserted` / `:removed` (postojeća arhitektura — vidi mem://technical-choices/event-bus-architecture) i sinkronizuje između tabova/prozora.
  - Eksportuje `useBacklinkIndex(subjectId)` hook koji koristi `useSyncExternalStore` da emituje samo onaj `BacklinksPanel` koji gleda relevantan subjekat.

- `BacklinksPanel`:
  - Uklanja `findBacklinks` regex sweep.
  - Poziva `useBacklinks(subjectId, targetTitle, targetId)` → O(1) lookup.
  - Zadržava `isEditing` snapshot ponašanje (ne emituje update dok edit traje).

- Bootstrap u `ZettelkastenView`:
  - Nakon `loadArticlesBySubject` zove `backlinkIndex.rebuildFromAll(subjectId, articles)` jednom.
  - `flushDraft` i `bulkCreateArticlesIfMissing` emituju `kb-article:upserted` event s novim sadržajem.
  - `deleteArticle` emituje `:removed`.

**Performans:** O(1) lookup po otvaranju + O(linkova u članku) update po save-u. Inicijalni rebuild je O(N×C) ali se izvršava **jednom** asinhrono (idle-callback) umjesto svaki put.

---

## 3. A3 — Strukturalna poređenja umjesto JSON.stringify

**Pogođena mjesta (4 stvarna problema):**

| Fajl:linija | Problem | Rješenje |
|---|---|---|
| `useCardCRUD.ts:34` | `sourceModules` poređenje za invalidaciju coverage cache-a | Helper `sameSourceModules(a, b)`: dužina + strukturalno poređenje po stabilnom UUID ključu. |
| `ZettelkastenView.tsx:150` | `linkedSourceIds` "dirty" check (redoslijed bitan?) | Helper `sameStringSet(a, b)` (Set-based, redoslijed nebitan) + odvojeni `sameStringList` ako se redoslijed gleda — ovdje je Set OK jer je to lista linkova. |
| `SRSettingsPanel.tsx:148-156` | `JSON.stringify(local) !== JSON.stringify(settings)` na 5 mjesta za detekciju "dirty" forme + isDefault | Helper `shallowSettingsEqual(a, b, keys)` — iterira po listi ključeva, primitivna jednakost. Settings objekti imaju samo primitive + plitka polja. |
| `PassiveReader.tsx:100`, `LocalSpeedReader.tsx:92` | `JSON.stringify({ subFilter, chapterFilter, typeFilter })` kao `useEffect` dep | Pretvoriti u tri zasebna deps direktno (`[subFilter, chapterFilter, typeFilter]`) — eliminiše stringifikaciju per render. |

**Ne diramo** (legitimno korištenje JSON.stringify za serijalizaciju u storage): `edit-return.ts`, `tts.ts`, `subject-settings.ts`, `app-settings.ts`, `storage.ts`, `useCardDraftAutosave.ts`, `useCardImport.ts:433`, `useCardExport.ts`, `MentalSkeleton.tsx`, `ErrorBoundary.tsx`, `SubjectHierarchyTree.tsx`. Ova mjesta serijalizuju za perzistenciju, nisu performans hot-path.

**Novi util:** `src/lib/struct-eq.ts` sa `sameStringSet`, `sameStringList`, `sameSourceModules`, `shallowEqualByKeys`. Pokriven test-fajlom.

---

## 4. B11+B12 — Post-save navigacija + Bulk add

**B11 — Post-save navigacija:** `handleSubmit` u `useCardSubmit` ne radi ništa nakon poziva `onSave` — navigacija je zakopana u parent-u. Standardizujemo:

- Novi prop u `CardForm`: `onAfterSave?: (createdId: string | null, mode: "stay" | "next" | "back") => void`.
- Po default-u: nakon save → `mode="back"` (postojeće ponašanje, pozove `onCancel`).
- Trenutni handlere `onSave/onSaveFlash` proširiti da vraćaju `string | null` (id kreirane kartice) — minor type change ali compatibilan jer postojeći callers mogu vratiti `void` (treat as `null`).

**B12 — "Sačuvaj i dodaj sljedeću":**

- Novi button u `CardForm` footeru pored "Sačuvaj": **"Sačuvaj i nastavi"** (`Ctrl+Enter`).
- Pozove submit, ali nakon uspjeha:
  - **Resetuje samo content** (`question`, `flashAnswer`, `sections` → defaults).
  - **Zadržava metadata** (kategorija/subkategorija/chapter/frequencyTag/sourceType) — power-user dodaje 10 kartica u istu glavu bez ponovnog odabira.
  - Briše draft, vrati fokus na `question` polje.
  - Mali toast "Sačuvano. Dodaj sljedeću karticu."
- Sakriven u edit modu (`editCard != null`).

---

## Tehnički rezime

**Novi fajlovi:**
- `src/hooks/useCardContent.ts` — sadržaj + sekcije + validacija.
- `src/hooks/useCardMetadata.ts` — taksonomija + frequencyTag/sourceType + linkedGazetteInfo.
- `src/hooks/useCardSubmit.ts` — submit + width + draft autosave + bulk-add reset.
- `src/lib/backlink-index.ts` — per-subject reverzni indeks + `useBacklinks` hook (useSyncExternalStore).
- `src/lib/struct-eq.ts` — strukturalni komparatori.
- `src/test/backlink-index.test.ts`, `src/test/struct-eq.test.ts`, `src/test/use-card-content.test.ts` — testovi.

**Izmijenjeni fajlovi:**
- `src/hooks/useCardActions.ts` — pretvoren u tanki barrel koji kompoznira tri sub-hooka (back-compat shape).
- `src/components/CardForm.tsx` — `onAfterSave` prop, "Sačuvaj i nastavi" dugme, kraći prosljeđivanje propsa u memo-iranim sekcijama.
- `src/components/card-form/MetadataSection.tsx`, `EditorSection.tsx` — `React.memo` + uže propsy.
- `src/components/zettelkasten/BacklinksPanel.tsx` — koristi `useBacklinks`, uklanja regex sweep.
- `src/views/ZettelkastenView.tsx` — bootstrap indeksa, emituje upsert/remove na save/delete, koristi `sameStringSet` umjesto JSON.stringify.
- `src/hooks/useCardCRUD.ts` — `sameSourceModules` umjesto JSON.stringify.
- `src/components/SRSettingsPanel.tsx` — `shallowEqualByKeys` umjesto JSON.stringify šabona.
- `src/components/subject-cards/PassiveReader.tsx` + `LocalSpeedReader.tsx` — split filter deps.

**Bez breaking change-ova** za korisnika ni za perzistenciju.

---

## Redoslijed izvršavanja

1. **A3** — `struct-eq.ts` + zamjena na 4 mjesta (najmanji rizik, čista pobjeda).
2. **A2** — `backlink-index.ts` + integracija (potpuno izolovan modul, postojeći BacklinksPanel ima fallback ponašanje).
3. **B1** — Sub-hooki + barrel migracija `useCardActions` (najveći diff, ali jedan consumer).
4. **B11+B12** — UX dugme i navigacija (gradi na B1 sub-hookima).

Nakon svakog koraka pokrećem postojeći test suite + nove testove. Memorija (`mem://`) se ažurira na kraju.