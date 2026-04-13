

# Plan: Unifikacija header dugmadi + navigacioni panel fix

## Pregled izmjena

### 1. Sidebar: "Dashboard" → "Početna tabla"
**Fajl:** `src/components/AppSidebar.tsx` (linija 15)
- Zamijeniti `label: "Dashboard"` sa `label: "Početna tabla"`

### 2. InfoPanel: "Kako funkcioniše?" → "Info"
**Fajl:** `src/components/InfoPanel.tsx` (linija 21)
- Zamijeniti `<span className="hidden sm:inline">Kako funkcioniše?</span>` sa `<span className="hidden sm:inline">Info</span>`

### 3. Onboarding dugme: dodati tekst "Onboarding" pored ikonice
Na svim stranicama gdje postoji onboarding dugme, dodati tekst label. Trenutno je to samo `<HelpCircle>` ikonica.

**Fajlovi:**
- `src/views/DashboardPage.tsx` (linija 45-52)
- `src/views/StatsPage.tsx` (linija 29-36)
- `src/views/PlannerPage.tsx` (linija 34-41)
- `src/views/MetacognitivePage.tsx` (linija 30-37)
- `src/views/SpeedReaderPage.tsx` (linija 13-20)

Zamjena sa:
```tsx
<button
  onClick={() => setShowOnboarding(true)}
  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary"
  title="..."
  aria-label="..."
>
  <HelpCircle className="h-3.5 w-3.5" />
  <span className="hidden sm:inline">Onboarding</span>
</button>
```
Stil je usklađen sa InfoPanel dugmetom za konzistentan izgled.

### 4. Premjestiti Onboarding dugme u header red komponente (pored InfoPanel-a)
Umjesto da Onboarding bude `absolute` na stranici, a InfoPanel unutar komponente — obje dugmadi trebaju biti u istom redu u zaglavlju.

**Pristup:** Na stranicama Stats, Planner, Metacognitive i SpeedReader:
- Ukloniti absolute-pozicionirano Onboarding dugme iz Page fajla
- Proslijediti `onShowOnboarding` callback kao prop u child komponentu
- U child komponenti, dodati Onboarding dugme pored InfoPanel-a u header redu

**Fajlovi za izmjenu:**

| Page fajl | Komponenta | Izmjena |
|-----------|-----------|---------|
| `StatsPage.tsx` | `MyStats.tsx` | Dodati `onShowOnboarding` prop, renderovati Onboarding dugme pored InfoPanel |
| `PlannerPage.tsx` | `StrategicPlanner.tsx` | Isto |
| `MetacognitivePage.tsx` | `MetacognitiveCenter.tsx` | Isto |
| `SpeedReaderPage.tsx` | `SpeedReader.tsx` → `SpeedReaderSelector.tsx` | Isto |

Primjer novog header reda u komponenti (npr. MyStats):
```tsx
<div className="flex items-center justify-between">
  <div>
    <h2>...</h2>
    <p>...</p>
  </div>
  <div className="flex items-center gap-1">
    <InfoPanel .../>
    <button onClick={onShowOnboarding} className="flex items-center gap-1 text-xs ...">
      <HelpCircle className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Onboarding</span>
    </button>
  </div>
</div>
```

## Scope
- ~10 fajlova, male izmjene u svakom
- Bez promjene funkcionalnosti, samo pozicioniranje i labele

