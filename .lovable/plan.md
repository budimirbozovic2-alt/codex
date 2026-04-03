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

```ts
interface PlannerConfig {
  // Postojeće (zadržano)
  finalGoalDate: string | null;
  bufferPercent: number;
  createdAt: number;
  
  // Novo
  dailyAvailableMinutes: number;      // koliko minuta dnevno
  hardSubjects: string[];             // UUID-ovi "teških" predmeta
  subjectOrder: string[];             // redoslijed predmeta (drag-and-drop)
  
  // Deprecated — migracija
  phases?: StudyPhase[];              // stare faze, zadržane za migraciju
}
```

**Faze se VIŠE NE KREIRAJU RUČNO** — sistem ih automatski generiše iz taksonomije (kategorija → potkategorija). Korisnik kontroliše parametre, sistem pravi plan.

### C. Auto-generisanje plana (`generateStudyPlan`)

Nova funkcija u `planner-storage.ts`:

```
generateStudyPlan(config, categoryRecords, cards) → SubjectPlan[]
```

Algoritam:
1. Za svaki predmet, izračunaj ukupan broj sekcija
2. Primijeni težinski koeficijent (1.5x za "teške")
3. Rasporedi proporcionalno po efektivnim danima (dani do ispita × (1 - buffer%))
4. Unutar svakog predmeta, podijeli po potkategorijama (proporcionalno broju sekcija)
5. Generiši timeline sa procijenjenim start/end datumima

Rezultat:
```ts
interface SubjectPlan {
  categoryId: string;
  categoryName: string;
  weight: number;              // 1.0 ili 1.5
  totalSections: number;
  learnedSections: number;
  allocatedDays: number;
  startDate: Date;
  endDate: Date;
  units: SubjectUnit[];        // potkategorije/glave
}

interface SubjectUnit {
  id: string;                  // subcategoryId ili chapterId
  name: string;
  totalSections: number;
  learnedSections: number;
  allocatedDays: number;
}
```

### D. Omjer učenje/ponavljanje (dinamički)

Nova funkcija koja računa idealni omjer na osnovu globalnog progresa:

```
calcLearningReviewRatio(overallProgress%) → { learnPct, reviewPct }
```

| Progres | Učenje | Ponavljanje |
|---------|--------|-------------|
| 0-20%   | 90%    | 10%         |
| 20-50%  | 70%    | 30%         |
| 50-80%  | 40%    | 60%         |
| 80-100% | 10%    | 90%         |

Ovo se prikazuje u Reality Check sekciji i na Dashboardu (zamjenjuje hardkodirani `IdealFocus`).

### E. UI promjene

**OperationsTab — potpuni redizajn:**
- Ukloniti "Nova faza" formu i ručno kreiranje faza
- Zamijeniti sa **predmetnim karticama** — svaka kategorija je kartica sa:
  - Naziv predmeta + progress bar
  - Ekspandabilna lista potkategorija sa individualnim progresom
  - Procijenjeni datumi (dinamički, kao i do sad)
  - Link ka bazi podataka
- Zadržati: Reality Check, Smart Load Balancing, Burnout Protection, Cognitive Debt
- Dodati: Omjer učenje/ponavljanje widget
- Dodati: "Rekonfiguriši plan" dugme → otvara wizard ponovo

**RoadmapTab — minimalne promjene:**
- Burn-up chart ostaje isti
- "Progres po fazama" → "Progres po predmetima" (koristi nove SubjectPlan podatke)
- Simulacija završetka ostaje ista

**DisciplineTab — bez promjena**

**Setup Wizard — nova komponenta:**
- `PlannerSetupWizard.tsx` — 3-step modal/overlay
- Prikazuje se automatski ako `config.dailyAvailableMinutes` nije postavljen (prvi put)
- Može se otvoriti ponovo iz OperationsTab-a

### F. Fajlovi koji se mijenjaju

| Fajl | Promjena |
|------|----------|
| `src/lib/planner-storage.ts` | Nova `PlannerConfig`, `generateStudyPlan()`, `calcLearningReviewRatio()`, migracija starih faza |
| `src/types/planner.ts` | Novi tipovi `SubjectPlan`, `SubjectUnit` |
| `src/hooks/usePlannerData.ts` | Koristiti `generateStudyPlan` umjesto `calcPhaseProgress`, dodati `categoryRecords` dependency |
| `src/components/planner/OperationsTab.tsx` | Potpuni redizajn — predmetne kartice umjesto ručnih faza |
| `src/components/planner/RoadmapTab.tsx` | Zamjena "faze" sa "predmeti" u per-phase snapshot |
| `src/components/planner/PhaseItem.tsx` | Zamijeniti sa `SubjectCard.tsx` — kartica za predmet |
| `src/components/planner/PlannerSetupWizard.tsx` | **NOVI** — 3-step setup wizard |
| `src/components/StrategicPlanner.tsx` | Proslijediti `categoryRecords`, prikazati wizard ako nije konfigurisan |
| `src/views/PlannerPage.tsx` | Proslijediti `categoryRecords` |

### G. Šta se zadržava (integriše)

- Reality Check (traffic light) — isti algoritam
- Smart Load Balancing — isti, ali sada per-subject
- Burnout Protection — isto
- Cognitive Debt — isto
- Burn-up Chart — isto
- Discipline Tracker — isto
- Velocity kalkulacija — isto
- Buffer % — isto

### H. Migracija

Ako korisnik ima stare `phases[]`, sistem ih ignoriše i generiše novi plan iz taksonomije. Stare faze ostaju u konfiguraciji ali se ne koriste.

## Scope
- 2 nova fajla (`PlannerSetupWizard.tsx`, `SubjectCard.tsx`)
- 7 modifikovanih fajlova
- 1 fajl uklonjen (`PhaseItem.tsx` → zamijenjeno sa `SubjectCard.tsx`)
- Potpuno kompatibilno sa postojećim podacima (migracija)
