## Goal

Selekcija teksta u izvorima trenutno otvara tooltip ("Napravi esej" / "Poveži sa postojećim") **iznad** označenog teksta. Pošto se izvor čita i markira odozgo prema dolje, tooltip pokriva tekst koji korisnik tek treba pročitati. Premještamo tooltip **ispod** selekcije.

## Changes (2 male, lokalizovane izmjene)

### 1. `src/hooks/useSourceReaderActions.ts` (line 52)
Promijeniti anchor poziciju selekcije sa vrha na dno bounding-rect-a:

```ts
// prije
y: rect.top - containerRect.top - 8,
// poslije
y: rect.bottom - containerRect.top + 8,
```

### 2. `src/components/source-reader/SourceTooltip.tsx` (lines 25–67)
- Ukloniti `-translate-y-full` iz wrapper klase (tooltip se sada renderuje **ispod** anchor tačke umjesto iznad).
- Premjestiti `<div>` strelicu (rotirani kvadrat) sa **dna** na **vrh** tooltip-a, sa `-mb-1.5` umjesto `-mt-1.5`, tako da pokazuje nagore prema selekciji.
- Sadržaj dugmadi (Napravi esej, Poveži sa postojećim, edit-mode formatting opcije) ostaje identičan.

## Out of scope

- Pozicioniranje pri ivici viewport-a (flip-up kada nema mjesta ispod) — trenutni dizajn ne radi flip ni za gornju varijantu, pa to ostaje kako jest.
- Bilo koja druga logika selekcije, edit mode, ili kontekstnog menija.
