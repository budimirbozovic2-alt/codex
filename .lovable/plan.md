## Problem

U trenutnoj OPEN fazi Active Recall-a prikazuje se samo pitanje (kroz `SessionHeader`) i dugme „Pročitao sam pitanje", ali **odgovor (sekcije) se ne vidi**. Korisnik želi da pri otvaranju kartice automatski vidi i pitanje i kompletan odgovor, kako bi ih oboje mogao pročitati prije nego klikne potvrdu i pređe u recall fazu.

## Promjena

### `src/components/learn/StudyModeRecall.tsx` — OPEN faza

Proširiti renderovanje OPEN faze tako da iznad dugmeta „Pročitao sam" prikaže sve sekcije odgovora (isti `TextSelectionTooltip` + `HighlightedSection` blok koji se već koristi u REVEAL fazi).

```
[OPEN]
  SessionHeader (pitanje vidljivo) ← već je tako
  + Sekcije odgovora (NOVO — auto prikaz)
  + Dugme "Pročitao sam — počni recall"
       ↓
[RECALL] (sve sakriveno, prompt na glas)
       ↓
[REVEAL] (pitanje + sekcije + ocjene)
```

Dugme se preimenuje u **„Pročitao sam — počni recall"** radi jasnoće.
Pomoćni tekst: „Pažljivo pročitaj pitanje i odgovor. Kada budeš spreman, potvrdi i pokušaj odgovor reprodukovati iz sjećanja."

## Što ostaje isto

- RECALL faza (sve sakriveno, dugme „Prikaži odgovor")
- REVEAL faza (pitanje + sekcije + 4 ocjene)
- Logika ocjena, leech brojač (4 pokušaja), FSRS hranjenje
- `markedRef` guard — `onMarkRead` se i dalje zove tačno jednom po kartici, na OPEN→RECALL tranziciji
- `SessionHeader` i `hideQuestion` prop (ne mijenja se)
