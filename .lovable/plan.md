

## Strateški Planer — Plan implementacije

### Pregled

Novi modul omogućava korisniku da definiše vlastite studijske faze ("Dekade"), postavi konačni cilj (datum ispita), a sistem u realnom vremenu upoređuje planirani i stvarni napredak, daje zeleno/žuto/crveno svjetlo i predlaže dnevni broj kartica.

### 1. Storage sloj (`src/lib/planner-storage.ts` — novi fajl)

Interfejsi i localStorage persistencija:

```typescript
interface StudyDecade {
  id: string;
  name: string;           // npr. "Anatomija fokus"
  durationDays: number;
  categories: string[];   // ciljani predmeti
  startDate: string;      // ISO date
}

interface PlannerConfig {
  decades: StudyDecade[];
  finalGoalDate: string | null;   // datum ispita
  createdAt: number;
}
```

Funkcije: `loadPlanner()`, `savePlanner()`, `calcVelocity(reviewLog, cards, days=7)` — prosječan broj novih naučenih sekcija dnevno u zadnjih N dana. `calcEstimatedFinish(remaining, velocity)` — projektovani datum.

### 2. UI komponenta (`src/components/StrategicPlanner.tsx` — novi fajl)

Tri sekcije u jednom ekranu:

**a) Planer (gornji dio)**
- Lista dekada sa mogućnošću dodavanja/brisanja (ime, trajanje, multi-select kategorija)
- Date picker za "Konačni cilj" (datum ispita)
- Vizuelni timeline dekada (horizontalni bar sa bojama)

**b) Reality Check (srednji dio)**
- Velocity metrika (novih sekcija/dan, 7-dnevni prosjek)
- Estimated Finish Date vs. Final Goal Date
- Statusno svjetlo:
  - Zeleno: projektovani datum < cilj → "Napreduješ odlično."
  - Žuto: kasni < 14 dana → "Kasniš X dana."
  - Crveno: kasni ≥ 14 dana → "Tempo nije dovoljan."
- "Sugestija za danas": izračunati tačan broj novih kartica na osnovu zaostatka

**c) Grafikon progresa (donji dio)**
- Recharts AreaChart: Planirana kriva (linearna od 0 do ukupnog broja sekcija po datumu cilja) vs. Stvarna kriva (kumulativni broj naučenih sekcija po danima)
- Tooltipovi sa datumom i brojevima

### 3. Integracija u aplikaciju

- **`Index.tsx`**: Dodati `"planner"` u `View` type, novi nav item "Planer" sa `Target` ikonom, renderovati `<StrategicPlanner>` komponentu
- **`MyStats.tsx`**: Dodati treći tab "Planer" u statistikama, ili widget-link ka planeru (slično Mapi znanja widgetu)
- **`Dashboard.tsx`**: Mini widget "Sugestija za danas" koji čita planer konfiguraciju i prikazuje kratku poruku sa zelenim/žutim/crvenim indikatorom i brojem kartica za danas

### 4. Propsi i podaci

`StrategicPlanner` prima: `cards`, `categories`, `reviewLog`, `onBack`

Velocity se računa interno iz `reviewLog` — broji sekcije koje su prvi put viđene u zadnjih 7 dana.

### Fajlovi koji se kreiraju/mijenjaju

| Fajl | Akcija |
|------|--------|
| `src/lib/planner-storage.ts` | Kreirati |
| `src/components/StrategicPlanner.tsx` | Kreirati |
| `src/pages/Index.tsx` | Dodati view, nav, routing |
| `src/components/Dashboard.tsx` | Dodati mini sugestija widget |
| `src/components/MyStats.tsx` | Dodati link/widget ka planeru |

