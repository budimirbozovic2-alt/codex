## Cilj

Uskladiti UI Active Recall-a sa pedagoškim ciljem aktivnog prisjećanja i hraniti FSRS pravim ocjenama na nivou kartice.

## Novi tok (po kartici)

```
[1] OPEN        Pitanje vidljivo. Dugme "Pročitao sam pitanje".
                ↓
[2] RECALL      Pitanje sakriveno. Prompt: "Ponovi odgovor na glas".
                Dugme "Prikaži odgovor".
                ↓
[3] REVEAL      Pitanje + svi moduli odgovora vidljivi.
                4 dugmeta ocjene (1 Ponovo, 2 Teško, 3 Dobro, 4 Lako).
                ↓
[4a] grade == 4 → kartica savladana → auto next
[4b] grade < 4  → leechCount++; vrati se na [2] RECALL
[4c] leechCount == 4 (4 ocjene < 4) → kartica označena LEECH/spasena → auto next
```

Brojač `leechCount` resetuje se po kartici. Vidljiv indikator pokušaja (npr. „Pokušaj 2/4 — još 2 prije nego se kartica spasi").

## Promjene u kodu

### `src/components/learn/StudyModeRecall.tsx` (glavni rad)

Zamijeniti trenutni `preview / drill` po-modulima tok jednim card-level state machine-om:

```ts
type RecallPhase = "open" | "recall" | "reveal";
const [phase, setPhase] = useState<RecallPhase>("open");
const [leechCount, setLeechCount] = useState(0);
```

Reset na promjenu `card.id` (kao i sada `markedRef`).

- **OPEN**: prikaži `card.question` (preko `SessionHeader` koji već radi). Sakrij sekcije. Dugme: "Pročitao sam pitanje" → `setPhase("recall")` + `onMarkRead(card.id)` (jednom, čuvati `markedRef` ponašanje da spriječi loop).
- **RECALL**: sakrij `SessionHeader` pitanje (proslijediti novi prop `hideQuestion` ili lokalno renderovati alternativni header bez `card.question`). Prikaži poruku "Ponovi odgovor na glas". Dugme: "Prikaži odgovor" → `setPhase("reveal")`.
- **REVEAL**: vrati pitanje + sve sekcije iz `card.sections` (renderovane kao u trenutnom „preview" bloku, sa `HighlightedSection`). Ispod: `GradeButtons` sa hint-om „Ocijeni koliko si znao".
  - `onGrade(g)`:
    - Pošalji ocjenu u FSRS za svaku sekciju kartice: `card.sections.forEach(s => onReviewSection(card.id, s.id, g))` (jedna ocjena = card-level signal). Time se očuvava postojeći API i FSRS update.
    - `setTotalGrades(prev => [...prev, g])`.
    - Ako `g === 4`:
      - `setCompletedCards(add card.id)`, `updateProgress(card.id, { completed: true })`, `setModulesCompleted(c => c + card.sections.length)`, `goNext()` (auto, sa malim delay-om za feedback).
    - Inače:
      - `next = leechCount + 1`; `setLeechCount(next)`.
      - Ako `next >= 4`: označi kao leech (`updateProgress(card.id, { completed: true, leech: true })`, dodati `leech?: boolean` u `LearnCardProgress`), `setCompletedCards(add)`, `goNext()`.
      - Inače: `setPhase("recall")` (vrati na recall fazu da pokuša ponovo).

Ukloniti staru logiku po-modulima (`drillIndex`, `drillRevealed`, `arPhase`, `handleArGrade` u trenutnoj formi).

### `src/components/learn/SessionHeader.tsx`

Dodati opcionalni prop:
```ts
hideQuestion?: boolean;
```
Kada je `true`, ne prikazuj `card.question` (samo header sa kategorijom, brojem, snagom). Postojeći konzumenti ostaju nepromijenjeni.

### `src/components/learn/GradeButtons.tsx`

Bez izmjena. Hint tekst se prosljeđuje iz `StudyModeRecall`.

### `src/lib/storage.ts` (`LearnCardProgress`)

Dodati opcionalno polje `leech?: boolean` (i opcionalno `failedAttempts?: number`) — non-breaking. Persist ostaje isti.

### `src/components/learn/types.ts`

Bez funkcionalnih izmjena (eventualno tip `RecallPhase` lokalno u komponenti).

### Indikator napretka

Zamijeniti trake po modulima sa jednom diskretnom oznakom u `RECALL/REVEAL` fazi:
- `Pokušaj {leechCount + 1} / 4` (ako `leechCount > 0`).
- Kada je 0, prikazati neutralno „Aktivno prisjećanje".

## Edge cases

- Kartica bez `sections` (prazna): tretiraj kao `[{ id: card.id, content: "" }]` — ocjena se pošalje sa fallback section ID-em, ili preskoči `onReviewSection` ali svejedno ažuriraj UI (kompromis: pošalji `onReviewSection(card.id, "default", g)` samo ako sekcija postoji; ako ne, samo `setTotalGrades`).
- Korisnik klikne „Sljedeća/Prethodna" sredinom toka: reset state-a na promjenu `card.id` već postoji, leechCount se resetuje.
- Strict-recall guard za `markRead` ostaje (prevencija beskonačne petlje); sada se `onMarkRead` zove iz `OPEN → RECALL` tranzicije, ne iz `useEffect` na mount.

## Što se NE mijenja

- `LearnSession.tsx`, `LearnPage.tsx`, `SessionContext`, FSRS algoritam, `onReviewSection` potpis.
- Filteri, sortiranje, navigacija (`QuestionDots`, `NavigationButtons`).
- `GradeButtons` komponenta i postojeći stilovi ocjena.

## Test

- Ručna provjera: otvori `/#/learn?mode=strict-recall&...` → vidi pitanje → klik „Pročitao sam" → pitanje nestaje → klik „Prikaži odgovor" → pojavi se pitanje + sekcije + 4 ocjene → ocjena 4 ide na sljedeću; ocjene <4 vraćaju u recall sa brojačem; nakon 4. ocjene <4 kartica se spasi i ide dalje.
- Provjeriti da `readCount` ne raste više od 1 po kartici (postojeći `markedRef` mehanizam).
