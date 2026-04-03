

# Internationalizacija i lokalizacija stringova

## Trenutno stanje
- **~50+ fajlova** sa hardkodiranim srpskim stringovima (300+ jedinstvenih stringova)
- Nema i18n biblioteke, nema centralnog rječnika
- Stringovi su razasuti po komponentama, hookovima, storage modulima i onboarding slidovima
- Svaka promjena teksta zahtijeva pronalaženje svakog fajla pojedinačno

## Problem
Održavanje je teško — isti pojmovi (npr. "Sačuvaj", "Učitavanje...", "Obriši") su duplirani na desetinama mjesta. Ako sutra treba dodati engleski jezik ili promijeniti terminologiju, potrebno je editovati 50+ fajlova.

## Predloženo rješenje

### Arhitektura: Centralni rječnik + React Context (bez eksterne biblioteke)

Umjesto uvođenja react-i18next (što bi bio overkill za app koji ima samo srpski), kreirat ću lagani sistem:

### 1. Centralni rječnik — `src/lib/i18n/sr.ts`
```text
export const sr = {
  common: {
    save: "Sačuvaj",
    cancel: "Otkaži",
    delete: "Obriši",
    close: "Zatvori",
    loading: "Učitavanje...",
    back: "Nazad",
    next: "Sljedeća",
    previous: "Prethodna",
    search: "Pretraga",
    confirm: "Potvrdi",
    ...
  },
  dashboard: {
    title: "Kontrolna tabla",
    dailyGoal: "Dnevni cilj",
    goalAchieved: "Cilj ostvaren!",
    forReview: "Za ponavljanje",
    learnedSections: "Naučene cjeline",
    ...
  },
  learn: { ... },
  review: { ... },
  planner: { ... },
  ...
}
```

### 2. Hook — `src/lib/i18n/useT.ts`
```text
// Jednostavan hook: const t = useT(); t("common.save")
// Podržava interpolaciju: t("review.remaining", { count: 5 })
```

### 3. Migracija po grupama (5 grupa)
| Grupa | Fajlovi | ~Stringova |
|-------|---------|------------|
| Common (buttoni, loading, empty) | ~15 | ~30 |
| Dashboard + Stats | ~10 | ~40 |
| Learn + Review | ~12 | ~50 |
| Planner + Metacognitive | ~8 | ~35 |
| Categories + Sources + MindMap | ~10 | ~45 |

### 4. Onboarding/Help tekst — `src/lib/i18n/sr-onboarding.ts`
Dugački tekstovi (onboarding slidovi, help paneli) u posebnom fajlu da ne zagušuju glavni rječnik.

## Plan implementacije

### Korak 1: Kreirati i18n infrastrukturu (~3 fajla)
- `src/lib/i18n/sr.ts` — rječnik (~200 ključeva)
- `src/lib/i18n/sr-onboarding.ts` — onboarding i help stringovi (~50 ključeva)
- `src/lib/i18n/useT.ts` — hook sa dot-notation pristupom i interpolacijom

### Korak 2: Migrirati common stringove (~15 fajlova)
Buttoni, loading indikatori, empty states, toast poruke

### Korak 3: Migrirati domenski specifične stringove (~20 fajlova)
Dashboard, Learn, Review, Planner widgeti

### Korak 4: Migrirati onboarding i help sadržaj (~8 fajlova)
AppOnboarding, DashboardOnboarding, ReviewOnboarding, LearnOnboarding slidovi

### Korak 5: Migrirati preostale (~10 fajlova)
Categories, Sources, MindMap, Settings, Metacognitive

## Šta se NE radi
- **Dodavanje engleskog jezika** — samo centralizacija, ne prevod (može se lako dodati kasnije)
- **react-i18next** — prevelik overhead za jednojeziični app
- **Promjena bilo kojeg teksta** — samo premještanje u centralni fajl

## Scope
- 3 nova fajla (rječnik + hook)
- ~50 fajlova modificirano (zamjena hardkodiranih stringova sa `t()` pozivima)
- Nema vizualnih promjena — korisnik vidi identičan tekst
- Nema novih zavisnosti

## Benefiti
- Jedna lokacija za sve stringove umjesto 50+
- Lako dodavanje engleskog (ili bilo kojeg) jezika u budućnosti
- Konzistentna terminologija (nema više "Sačuvaj" vs "Spremi" varijacija)
- Lakše pronalaženje i ažuriranje teksta

