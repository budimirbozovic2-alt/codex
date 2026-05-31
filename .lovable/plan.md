## Iskreni nalaz prije plana

**Tvrdnja #1 — `idb-dexie.ts` / `idb-adapter.ts` / `mirroring-adapter.ts` čekaju brisanje:**
**Pogrešno.** Sva tri fajla **već ne postoje**. Provjerio sam:
- `src/legacy/` i `src/lib/legacy/` — direktorija nema.
- `src/lib/persistence/` sadrži samo `PersistAdapter.ts`, `adapter-factory.ts`, `opfs-sqlite-adapter.ts`, `sqlite/`, `write-result.ts`. Nema `idb-adapter.ts` ni `mirroring-adapter.ts`.
- `rg` nigdje ne nalazi `idb-dexie`, `idbAdapter`, `MirroringAdapter` u `src/`.

Memory `Dexie Removal Final (Phase C)` to već dokumentuje. **Ovdje nema posla.**

**Tvrdnja #2 — `src/contexts/cards/useCardAggregates.ts` i `src/lib/subject/aggregators.ts` vrte `.filter()`/`.reduce()` umjesto SQL `SELECT COUNT(*)` u Web Workeru:**
Putanja prva je netačna (fajl je u `src/hooks/cards/useCardAggregates.ts`), ali zabrinutost je djelimično validna — uz važne ograde.

Šta agregatori zaista računaju:
- `dueCards: Card[]` — pune Card objekte, ne broj.
- `stats.due` — zahtijeva walk kroz `card.sections[*].state` i `nextReview` da bi se našao `minNonNewNextReview` po kartici.
- `learnedSections`, `totalSections`, `leechCount` — section-level brojanja.
- `categoryStats.score` — poziva `getSectionScore` (čisti FSRS) po sekciji, mean per category.
- `cardCountByCategory` — jedino čisto brojanje.

**Zašto SQL `SELECT COUNT(*)` u Web Workeru NIJE rješenje za 90% ovoga:**
1. `sections` su pohranjene kao **JSON blob unutar `cards` reda**, nisu zasebna SQL tabela. Ne možeš `COUNT(*) FROM sections WHERE state != 'New'`.
2. `nextReview`, `state`, `leech` su FSRS-derivisana polja unutar JSON-a — ni indeksa, ni WHERE.
3. `score` se računa preko `getSectionScore` (čista FSRS funkcija u JS-u, ne SQL).
4. `useAllCards()` ionako vuče sve kartice u TanStack za UI (CardList, SubjectDashboard, GlobalSearch). Worker bi računao nad istim podacima — duplikat preko `postMessage` granice, koja sama kreira 5–20 ms latencije.
5. SQLite-WASM već radi na main threadu (OPFS adapter). Premještanje u Worker traži drugi konekcijski seam i FK-aware tx koordinaciju — značajno opsežnije od onog što ovaj task predlaže.

**Šta JESTE realan win, bez Workera:**
- `cardCountByCategory` se sada izvodi iz pune `cards` array umjesto da koristi već postojeći `useCardCountByCategory` (SQL `SELECT COUNT(*) AS n FROM cards WHERE categoryId = ?`). Ovaj hook postoji u `useCardsQuery.ts:125` ali ga **niko ne koristi** — `CategoriesPage`, `SRSettingsPanel`, `SubjectsTab`, `CategoryManager` svi vuku iz `useCardData().cardCountByCategory` (full reduce).
- `useCardAggregates` može se podijeliti: `dueCards`/`stats`/`categoryStats` ostaju (JS, derivirano iz FSRS), ali `cardCountByCategory` izlazi iz hooka i ide na per-category SQL count.

## Plan: PR-F — Per-Category Count SQL Cutover

Mali, fokusirani PR. Ne dira FSRS agregaciju (nema smisla u SQL), samo seli COUNT-only put na već postojeći SQL helper.

### Obim

**F1 — Granular count consumeri pređu na `useCardCountByCategory`**
- `src/views/CategoriesPage.tsx` — zamijeniti `useCardData().cardCountByCategory[cat]` sa `useCardCountByCategory(cat)` per row.
- `src/components/CategoryManager.tsx` — isto, `cardCountByCategory[cat]` lookups (linije 104, 288, 291, 298). Ovaj prima count kao prop, pa orchestrator (`CategoriesPage`) treba dati map ili hook (vidi F2).
- `src/components/settings/SubjectsTab.tsx` — isto, props-driven.
- `src/components/SRSettingsPanel.tsx:78` — `useCardData().cardCountByCategory`.

**F2 — Mali wrapper hook za "map of counts" gdje je potreban**
- Dodati `useCardCountsByCategoryMap(categoryIds: string[]): Record<string, number>` u `src/hooks/card/useCardsQuery.ts` — pokreće `useQueries` per ID, vraća stabilan map. TanStack dedupes po queryKey, ostali consumeri istog `categoryId` koriste isti cache.
- Ova map ulazi u `CategoryManager` i `SubjectsTab` umjesto trenutnog props patterna.

**F3 — Skinuti `cardCountByCategory` iz `useCardAggregates` + `useCardData`**
- `useCardAggregates` više ne vraća `cardCountByCategory` — ostaje samo `dueCards`, `stats`, `categoryStats`.
- `useCardData` više ne vraća `cardCountByCategory`.
- Update tipova: `CardStateContextValue`, `CategoriesPageProps`, `SRSettingsPanelProps`, `SubjectsTabProps`.

**F4 — Test pokrivenost**
- Novi `card-count-by-category-sql.test.tsx`: provjerava da `useCardCountByCategory` vraća SQL count i invalidira se na `notifyCardsChanged`.
- Postojeći `card-selectors.test`-style testovi nisu pogođeni (`useCardAggregates` testovi gađaju `dueCards`/`stats`/`categoryStats`).

### Šta NE radimo (svjesno)

- **Ne** premještamo `useCardAggregates` u Web Worker — embedded JSON sekcije + FSRS score nije izvodljivo bez schema migracije + worker konekcije, a profit je sumnjiv (TanStack već dijeli iste podatke za UI).
- **Ne** brišemo nepostojeće `idb-dexie`/`idb-adapter`/`mirroring-adapter` fajlove.
- **Ne** mijenjamo `aggregateSubjectProgress` (`src/lib/subject/aggregators.ts`) — radi nad već scoped `useCardsByCategory` arrayom (jedan predmet, stotine kartica), pure funkcija, lako testabilno. Premještanje ovoga je gradient bez koristi.

### Tehnička napomena

`useCardCountByCategory` već postoji i koristi `staleTime: Infinity` + `onCardsChanged` bridge za invalidaciju. Posle PR-E (TanStack SSOT), svaki write šalje `notifyCardsChanged()` → bridge → invalidate `['cards', ...]` prefix → count queries refetch. Konsistencija je već garantirana, samo se prešalta read seam s "in-memory reduce" na "SQL COUNT".

### Očekivani efekat

- Per-render rad u `CategoriesPage`, `SubjectsTab`, `SRSettingsPanel` pada sa O(N) reduce nad `useAllCards()` na O(1) lookup TanStack cachea (count value je broj).
- `useCardData` više ne treba `useAllCards` čisto za count put — `dueCards`/`stats` ostaju, ali consumeri samo za count (kao Settings ekran) više ne forsiraju hidrataciju cijelog cards arraya kroz ovaj orchestrator.
- Memory profil neznatno bolji; mjerljiv win je rerender cost na taxonomy-heavy ekranima.
