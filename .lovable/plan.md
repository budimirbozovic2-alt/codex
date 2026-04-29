## Cilj

1. **Ukloniti dugme "Nastavi učenje"** iz globalnog dashboarda i navigacije.
2. **Ukloniti tri globalna učenje moda**: Slobodno (`free`), Aktivno prisjećanje (`active-recall` selector) i Lanac (`chain`) — jer ih zamjenjuje Pasivno čitanje u lokalnim subject dashboardima.
3. **Sačuvati strict-recall flow** — taj ulaz koristi `SubjectDashboard` (MatrixFilterDialog → `/learn?mode=strict-recall`), to je sad jedini razlog zašto `/learn` ruta postoji. Korisnik je eksplicitno rekao "aktivno učenje se seli u lokalne dashboarde", ne da se briše — strict-recall je upravo taj lokalni ulaz.
4. Ne ostaviti dead code, ne razbiti tipove, ne razbiti analitiku.

## Šta se uklanja

### Globalni dashboard / navigacija
- **`src/components/dashboard/QuickActions.tsx`** — ukloniti `<Link to="/learn">Nastavi učenje</Link>`. Komponenta ostaje samo s "Ponovi dospjele" linkom (ako ima dospjelih).
- **`src/components/dashboard/StudyFlowWidget.tsx`** — ukloniti `<Button onClick={() => setView("learn")}>Nastavi učenje</Button>`. Widget ostaje informativan (plan/omjer/progress).
- **`src/components/AppSidebar.tsx`** (l. 16) — ukloniti stavku `{ path: "/learn", icon: GraduationCap, label: "Učenje" }`.
- **`src/components/TopNav.tsx`** (l. 25) — isto.
- **`src/components/Breadcrumbs.tsx`** (l. 8) — ukloniti `"/learn": "Učenje"` mapu (ili je ostaviti — breadcrumb i dalje radi za strict-recall sesiju). Predlažem zadržati zbog UX dok je strict-recall aktivan.
- **`src/views/DashboardPage.tsx`** (l. 48) — ukloniti `L` keyboard prečicu iz InfoPanel.

### Tri globalna moda učenja
- **`src/components/LearnSession.tsx`** — refaktorisati: ukloniti `ModeSelector` setup korak, ukloniti grane `learnMode === "free"` i `learnMode === "chain"`, ostaviti samo `active-recall` granu (jer je to ono što strict-recall koristi). Default `learnMode` postaje `"active-recall"`. Setup flow sada počinje direktno sa `FilterSetup` (a strict-recall ulaz je već `started=true`).
- **Brisati fajlove**:
  - `src/components/learn/ModeSelector.tsx`
  - `src/components/learn/StudyModeFree.tsx`
  - `src/components/learn/StudyModeChain.tsx`
- **`src/components/learn/SessionHeader.tsx`** — pojednostaviti `learnMode` granjanje (uvijek "Aktivno"); skinuti reference na `LEARN_SHORTCUTS` i `CHAIN_SHORTCUTS` iz `ShortcutsHint` poziva, ostaviti samo `AR_SHORTCUTS`. Ako su konstante nedefinisane u tom fajlu, samo ostaviti `AR_SHORTCUTS`.
- **`src/components/learn/QuestionDots.tsx`** — `learnMode` prop više nije potreban (uvijek "active-recall"); pojednostaviti ili zadržati prop kao opcionalan radi minimalne invazivnosti. Predlažem da ga zadržimo, ali pojednostavimo logiku.
- **`src/components/learn/SessionComplete.tsx`** — skinuti grane za "free" i "chain", ostaviti samo "active-recall".
- **`src/components/learn/FilterSetup.tsx`** — ukloniti `MODE_LABELS["free"]`, `MODE_LABELS["chain"]` reference; ukloniti chain-specific filter (`learnMode === "chain"` filter za essay≥3 sekcije).
- **`src/components/learn/types.ts`** — `learnMode` props ostaju ali samo s vrijednošću `"active-recall"`.
- **`src/lib/storage.ts`** (l. 23) — promijeniti `LearnMode` u `type LearnMode = "active-recall"`. Time se osigurava type-safety i da nema preživjelih `"free"`/`"chain"` literala u kodu — TS će ih označiti.
- **`src/lib/metacognitive-storage.ts`** — ukloniti `"learn-free"` i `"learn-chain"` iz `ActivityType` union-a. Ažurirati switch i filtere u `getMastery`/aggregations da ne referencuju te tipove.

## Šta se NE briše (i zašto)

- **`/learn` ruta i `LearnPage`** — ostaju, jer ih `SubjectDashboard.handleMatrixStart` koristi. Sad je jedini ulaz u `/learn` strict-recall iz lokalnog dashboarda.
- **`LearnSession.tsx`** — ostaje, ali svedeno na strict-recall + `FilterSetup` (jer `SubjectDashboard` ulazi sa `started=true`, ali korisnik može doći nazad na filter screen).
- **`StudyModeRecall.tsx`** — ostaje (to je suština aktivnog prisjećanja).
- **`MatrixFilterDialog.tsx`** — ostaje (lokalni ulaz iz `SubjectDashboard`).
- **`View = "learn"` tip i mapa** u `AppContext.tsx` — ostaju radi rute. Nećemo ga brisati iz unije jer breadcrumb/route još koristi tu mapu.

## Migracija postojećih korisničkih podataka

Postojeći `LearnCardProgress` zapisi u IndexedDB mogu imati `mode: "free"` ili `mode: "chain"`. Pošto:
- `LearnCardProgress.mode: LearnMode` — nakon promjene tipa, postojeći zapisi su tehnički nevalidni ali se nigdje više ne čitaju za grananje (samo se prosljeđuju u `updateProgress`).
- `metacognitive-storage` activity log: postojeći entry-ji s `type: "learn-free" | "learn-chain"` će ostati u IDB. Da se ne razbije agregacija, u `getMastery`/filterima dodati defenzivnu provjeru (entry tipa koje više ne postoje će biti ignorisane jer ih TS unija ne pokriva — runtime prolazi, samo se neće brojati).

Ne pišemo migraciju (zero data loss, samo ignorisanje legacy entry-ja).

## Verifikacija nakon implementacije

1. Globalni dashboard ne sadrži "Nastavi učenje" dugme niti "Učenje" link u sidebar/TopNav.
2. Klik na Risk widget u SubjectDashboard → otvara strict-recall sesiju normalno.
3. `MatrixFilterDialog` → strict-recall sesija radi normalno.
4. TypeScript build prolazi bez `any`/unused/missing import grešaka.
5. Postojeći `learn-free`/`learn-chain` zapisi u activity logu ne izazivaju runtime crash u Metacognitive view.

## Lista fajlova koji se mijenjaju

**Edit:**
- `src/components/dashboard/QuickActions.tsx`
- `src/components/dashboard/StudyFlowWidget.tsx`
- `src/components/AppSidebar.tsx`
- `src/components/TopNav.tsx`
- `src/views/DashboardPage.tsx`
- `src/components/LearnSession.tsx`
- `src/components/learn/SessionHeader.tsx`
- `src/components/learn/SessionComplete.tsx`
- `src/components/learn/FilterSetup.tsx`
- `src/components/learn/QuestionDots.tsx`
- `src/components/learn/types.ts`
- `src/lib/storage.ts`
- `src/lib/metacognitive-storage.ts`

**Delete:**
- `src/components/learn/ModeSelector.tsx`
- `src/components/learn/StudyModeFree.tsx`
- `src/components/learn/StudyModeChain.tsx`
