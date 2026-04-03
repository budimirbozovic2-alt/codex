
# Restrukturiranje Strateškog planera

## Problem

Trenutni planer koristi generički model "faza" gdje korisnik ručno kreira faze i bira kategorije. Ovo je nelogično jer:
1. Svih 9 predmeta su obavezni — nema smisla birati koje ćeš učiti
2. Predmeti su ogromni — ne mogu se grupirati u jednu fazu od 14 dana
3. Sistem ne koristi informacije koje već ima (taksonomiju, broj kartica po predmetu)
4. Ne pita korisnika za ključne parametre (dnevno raspoloživo vrijeme, težina predmeta)

## Novo rješenje: Predmetno-orijentisani planer sa Setup wizardom

### A. Setup Wizard (prvi put / rekonfiguracija)

Umjesto ručnog kreiranja faza, sistem prikazuje **onboarding wizard** sa 3 koraka:

**Korak 1 — Parametri**
- Datum ispita (postojeći date picker)
- Dnevno raspoloživo vrijeme (slider: 1-8 sati, default 4h)
- Buffer % (postojeći, default 15%)

**Korak 2 — Težina predmeta**
- Prikazuje svih 9 kategorija sa brojem kartica/sekcija
- Korisnik označava "teške" predmete (toggle za svaki) — ovi dobijaju 1.5x koeficijent u raspodjeli vremena
- Default: nijedan nije označen (ravnomjerna raspodjela)

**Korak 3 — Pregled generisanog plana**
- Sistem automatski generiše raspored po predmetima
- Svaki predmet se dijeli na faze po **potkategorijama** (ili glavama ako nema potkategorija)
- Prikazuje timeline sa procijenjenim datumima za svaku potkategoriju
- Korisnik može potvrditi ili se vratiti i podesiti parametre

### B. Nova `PlannerConfig` struktura

```text
PlannerConfig {
  finalGoalDate: string | null        // postojeće
  bufferPercent: number               // postojeće
  createdAt: number                   // postojeće
  
  dailyAvailableMinutes: number       // NOVO — koliko minuta dnevno
  hardSubjects: string[]              // NOVO — UUID-ovi "teških" predmeta
  subjectOrder: string[]              // NOVO — redoslijed predmeta
  
  phases?: StudyPhase[]               // DEPRECATED — migracija
}
```

Faze se VISE NE KREIRAJU RUCNO — sistem ih automatski generiše iz taksonomije.

### C. Auto-generisanje plana

Nova funkcija `generateStudyPlan(config, categoryRecords, cards)`:
1. Za svaki predmet, izračunaj ukupan broj sekcija
2. Primijeni težinski koeficijent (1.5x za "teške")
3. Rasporedi proporcionalno po efektivnim danima
4. Unutar svakog predmeta, podijeli po potkategorijama
5. Generiši timeline sa start/end datumima

### D. Omjer učenje/ponavljanje (dinamički)

| Progres | Učenje | Ponavljanje |
|---------|--------|-------------|
| 0-20%   | 90%    | 10%         |
| 20-50%  | 70%    | 30%         |
| 50-80%  | 40%    | 60%         |
| 80-100% | 10%    | 90%         |

### E. UI promjene

**OperationsTab — potpuni redizajn:**
- Ukloniti "Nova faza" formu i ručno kreiranje faza
- Zamijeniti sa predmetnim karticama — svaka kategorija je kartica sa progresom, potkategorijama, procijenjenim datumima
- Zadržati: Reality Check, Smart Load Balancing, Burnout Protection, Cognitive Debt
- Dodati: Omjer učenje/ponavljanje widget + "Rekonfiguriši plan" dugme

**RoadmapTab — minimalne promjene:**
- "Progres po fazama" postaje "Progres po predmetima"

**DisciplineTab — bez promjena**

**Setup Wizard — nova komponenta (`PlannerSetupWizard.tsx`):**
- 3-step modal, prikazuje se automatski ako plan nije konfigurisan

### F. Fajlovi

| Fajl | Promjena |
|------|----------|
| `planner-storage.ts` | Nova `PlannerConfig`, `generateStudyPlan()`, `calcLearningReviewRatio()` |
| `types/planner.ts` | Novi tipovi `SubjectPlan`, `SubjectUnit` |
| `usePlannerData.ts` | Koristiti `generateStudyPlan` umjesto `calcPhaseProgress` |
| `OperationsTab.tsx` | Potpuni redizajn — predmetne kartice |
| `RoadmapTab.tsx` | Zamjena "faze" sa "predmeti" |
| `PhaseItem.tsx` → `SubjectCard.tsx` | Nova komponenta za predmet |
| `PlannerSetupWizard.tsx` | **NOVI** — 3-step wizard |
| `StrategicPlanner.tsx` | Proslijediti `categoryRecords`, prikazati wizard |
| `PlannerPage.tsx` | Proslijediti `categoryRecords` |

### G. Šta se zadržava

Reality Check, Smart Load Balancing, Burnout Protection, Cognitive Debt, Burn-up Chart, Discipline Tracker, Velocity, Buffer % — svi postojeći mehanizmi se integrišu oko novog predmetnog modela.
