
# A2 — categoryDeletion collapse

Cilj: jedna SQL transakcija, garantovan integritet preko FK CASCADE, manje LOC u service-u, čistija repo granica (Dexie pristup samo kroz helpere). Re-parent (`purgeCards=false`) ostaje podržan.

## Stanje

- `schema.sql`: sve potrebne FK CASCADE već postoje — `sources/cards/mindMaps/mnemonics/knowledgeBaseArticles → categories(id) ON DELETE CASCADE`, plus `cards.sourceId → sources(id) ON DELETE SET NULL`. `drafts/disciplineLog/majorSystem/mnemonicTestLog/kv` nisu category-scoped pa nemaju FK (nepromijenjeno).
- `PRAGMA foreign_keys = ON` postavlja `migration-runner.ts` na boot.
- Današnji service: paralelni SQLite tx koji eksplicitno briše cards/sources/mindMaps/mnemonics + Dexie tx koji ponavlja sve, plus settings KV i planner scrub. Categories red sam po sebi ne brišemo iz SQLite-a (writer ide kroz `idbSaveCategories`), pa FK CASCADE nikad ne okida iz orchestrator-ovog optimističnog patha.

## Promjene

### 1. `categoryRepository.deleteAsync(id)` — novi SQLite-primary delete

`src/lib/repositories/categoryRepository.ts`:
- Dodati `deleteAsync(id: string, opts: { purgeCards: boolean; fallbackId: string }): Promise<WriteResult<void>>`.
- Jedna `exec.transaction`:
  - Ako `purgeCards === false && fallbackId`: `UPDATE cards SET categoryId=?, subcategoryId=NULL, chapterId=NULL, updatedAt=? WHERE categoryId=?` + `UPDATE sources SET categoryId=? WHERE categoryId=?` (re-parent prije DELETE).
  - Zatim **jedini** `DELETE FROM categories WHERE id = ?` — FK CASCADE briše mindMaps + mnemonics + knowledgeBaseArticles (i, u `purgeCards=true` slučaju, cards + sources).
- Nakon tx: `await persistQueue.cleanup()`, Dexie mirror delete (preko helpera, vidi #2), KV scrub (vidi #3), zatim notify bridges (vidi #4).
- Eksportovati kroz repo barrel.

### 2. Repo-level `delete*ByCategory` helperi (Dexie mirror)

Novi async helperi (svaki bez keyedMutex-a — SQLite tx je already-serialised, Dexie ovde služi samo kao mirror dok A1c ne ukloni Dexie):

- `cardRepository.deleteByCategoryAsync(id)` / `cardRepository.reparentByCategoryAsync(fromId, toId)` → `src/lib/repositories/cardRepository.ts`
- `sourceRepository.deleteByCategoryAsync(id)` / `sourceRepository.reparentByCategoryAsync(...)` → novi ili postojeći `sourceRepository`
- `mindMapRepository.deleteByCategoryAsync(id)`
- `mnemonicRepository.deleteByCategoryAsync(id)`
- `knowledgeBaseRepository.deleteBySubjectAsync(id)`

Svi vraćaju `WriteResult<number>` (broj obrisanih/affected redova za telemetriju). Implementacija: `db.<table>.where(...).equals(id).delete()` ili `.modify(...)` za reparent.

### 3. Service skraćenje

`src/lib/category-deletion-service.ts` se skuplja na ~60 LOC:

```ts
export async function cascadeDeleteCategoryDomains(
  categoryId, { purgeCards, fallbackId }
): Promise<CascadeResult> {
  // 1. SQLite — jedan tx (re-parent + DELETE FROM categories, FK CASCADE)
  await categoryRepository.deleteAsync(categoryId, { purgeCards, fallbackId });

  // 2. Dexie mirror — preko repo helpera
  const [cardsN, srcN, mmN, mnN, kbN] = await Promise.all([
    purgeCards
      ? cardRepository.deleteByCategoryAsync(categoryId)
      : cardRepository.reparentByCategoryAsync(categoryId, fallbackId),
    purgeCards
      ? sourceRepository.deleteByCategoryAsync(categoryId)
      : sourceRepository.reparentByCategoryAsync(categoryId, fallbackId),
    mindMapRepository.deleteByCategoryAsync(categoryId),
    mnemonicRepository.deleteByCategoryAsync(categoryId),
    knowledgeBaseRepository.deleteBySubjectAsync(categoryId),
  ]);

  // 3. KV (settings + planner scrub) — postojeća logika, nedirnuta
  // 4. notify*Changed (bridges sve invalidiraju kroz QueryClient)
  // 5. cache invalidations (mindmap-cache, examiner-profile, backlinkIndex)
  return { cards: cardsN, sources: srcN, mindMaps: mmN, mnemonics: mnN, articles: kbN, … };
}
```

Uklonjeno:
- Lokalni `cascadeSqlite` helper (logika preseljena u `categoryRepository.deleteAsync`).
- Manuelni `db.transaction("rw", […])` blok i direktni `db.cards/sources/mindMaps/mnemonics/knowledgeBaseArticles` pozivi.
- `keyedMutex` reference oko brisanja (ako ih ima — service ih trenutno ne zove direktno, ali repo helperi se NEĆE zaviti u mutex).

### 4. Notifications

Nakon completion: pozvati `notifyCardsChanged()`, `onSourcesChanged` listener fire (kroz `sources-storage.invalidate`), `onMindMapsChanged`, `subscribeMnemonics` emit, `notifyKnowledgeBaseChanged()`. Bridges (`src/lib/query/bridges.ts`) invalidiraju sve relevantne queryKey-eve.

### 5. Orchestrator (`useCategoryManagement.deleteCategory`)

Nepromijenjen javno. Interno: pre-cascade `cardRepository.applySyncDelta` (RAM optimizam) ostaje — daje trenutnu UI reakciju. Service call ostaje isti potpis.

### 6. Test

`src/test/category-deletion.test.ts` (novi):
- Boot Vitest sa fakeIndexedDB + mock OPFS executor (postojeći helperi u `src/test/utils/`).
- Seed: kategorija A sa N cards / M sources / 2 mindMaps / 3 mnemonics / 4 KB articles preko repo API-ja.
- Slučaj 1 — `purgeCards: true`:
  - `cascadeDeleteCategoryDomains(A.id, { purgeCards: true, fallbackId: "" })`.
  - Assert SQLite: `categories/cards/sources/mindMaps/mnemonics/knowledgeBaseArticles WHERE *=A.id` svi prazni.
  - Assert RAM projekcije (`categoryStore`, `cardStore`, sources cache) prazne za A.
- Slučaj 2 — `purgeCards: false` sa fallback B:
  - Assert cards/sources premješteni na B sa `subcategoryId/chapterId = undefined`.
  - Assert mindMaps/mnemonics/KB articles obrisani (FK CASCADE).
  - Assert `categories` red za A obrisan, B netaknut.
- Slučaj 3 — KV scrub: seed `subject_settings:A` i `plannerConfig.subjectOrder=[A,B]` → assert ključ obrisan i `subjectOrder=[B]`.

## Tehnički detalji

- `WriteResult<T>` već postoji u `src/lib/persistence/write-result.ts` (M3f).
- `persistQueue.cleanup()` osigurava da boot-time read odmah vidi novo stanje.
- FK CASCADE kroz SQLite pokriva sve child tabele — schema već usklađena, nikakva migracija ne treba.
- Nema novih runtime errora — postojeća HMR-only React `useState` greška iz M3f je dev-only artefakt i nije A2 scope.
- Zero-any: svi novi async helperi tipovani sa `WriteResult<number>` / `WriteResult<void>`.

## Očekivani efekat

- `category-deletion-service.ts` ~184 → ~70 LOC.
- Service više ne importuje `db` direktno (samo repo barrels + KV queries) — zatvara Public API Walls.
- Jedna SQLite transakcija pokriva sav child-row teardown; Dexie mirror je striktno opcionalan i ide preko repo helpera (lako se isključuje u A1c).
- Garantovan referencijalni integritet (sirota mindMap/mnemonic/KB-article rows postaju nemogući).

## Memory update

Po završetku: ažurirati `mem://features/data-integrity-v4` da reflektuje "jedna SQLite tx + FK CASCADE; Dexie mirror kroz repo helpere; keyedMutex uklonjen iz deletion patha".
