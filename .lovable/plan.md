## Cilj

Ukloniti UI blok "Procjena sigurnosti (A–E)" koji se pojavljuje prije otkrivanja odgovora u Konsolidaciji (review sesiji).

## Analiza uticaja — bezbjedno za FSRS

Provjerio sam sve dodirne tačke `confidence` vrijednosti:

1. **FSRS algoritam** (`src/lib/sr/algorithm.ts`, `calculateNextReview`): NE prima `confidence`. Koristi isključivo `grade` (1–4), `state`, `stability`, `difficulty`, `lapses`. Uklanjanje procjene sigurnosti **nema nikakvog uticaja na FSRS scheduling**.

2. **Grading flow** (`ReviewCard.handleGradeWithCalibration`): `confidence` se koristi samo da se napravi `addCalibrationEntry(...)` zapis. Ako je `confidence === null`, taj zapis se **preskače** (već postojeća grana `if (confidence !== null)`). `onGrade(grade)` se poziva nezavisno.

3. **Metakognitivna analitika** (sekundarni, opcioni feature):
   - `CalibrationTab` (Statistika → Kalibracija): grafik koji upoređuje samoprocjenu vs. stvarnu ocjenu. Bez novih unosa, postojeći podaci ostaju vidljivi, ali grafik neće dobijati nove tačke iz Konsolidacije.
   - `blind-spots.ts` (CognitiveAnalytics): detektuje "slijepe tačke" gdje je korisnik bio jako siguran (≥4) ali pao (≤2). Bez novih unosa, novi blind-spotovi neće biti detektovani iz Konsolidacije.
   - Postojeća kalibracija ostaje u IndexedDB i prikazuje se normalno.

**Zaključak:** Uklanjanje je sigurno. Jedina posljedica je da se kalibraciona analitika više neće hraniti iz Konsolidacije. Ako se isti UI koristi u Active Recall / Learn sesiji, on tamo ostaje (provjerio sam — `LearnSession` koristi posebnu komponentu, nije dijeljen).

## Izmjene

**Fajl:** `src/components/review/ReviewCard.tsx`

1. Ukloniti cijeli `<div className="rounded-lg border bg-secondary/30 ...">` blok (linije 259–286) sa procjenom sigurnosti A–E.
2. Ukloniti `confidence` state i `setConfidence` (linija 44).
3. Ukloniti `setConfidence(null)` reset u `useEffect` (linija 53).
4. Pojednostaviti `handleGradeWithCalibration`: ukloniti `if (confidence !== null) { addCalibrationEntry(...) }` blok (linije 70–72) i `addCalibrationEntry` import (linija 11).
5. Hint tekst "Pokušaj odgovoriti na glas..." ostaje iznad dugmeta "Prikaži odgovor".

Ništa drugo se ne mijenja — FSRS, latency tracking (`addLatencyEntry`), grade flow, keyboard shortcuts, leech warning, early review notice — sve ostaje netaknuto.

## Šta NE diramo

- `metacognitive-storage.ts` — `addCalibrationEntry` i `CalibrationEntry` ostaju (postojeći podaci, eventualna buduća upotreba drugdje).
- `CalibrationTab` i `blind-spots.ts` — ostaju funkcionalni za prikaz istorijskih podataka.
- Backup schema — nepromijenjena.
