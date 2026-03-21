

## Dashboard Redesign: Informativni Overview

### Current State
Dashboard ima 506 linija sa: Hero naslov, Energy-Material Matcher, Strategic Reality Check, Core Stats sa "Ponavljaj" dugmetom, Idealni fokus, Memory Safety warning, Daily Goal, Effective Learning breakdown, 14-day Ratio Chart, Cognitive Debt, Planner Suggestion, Backup/Storage warnings.

### Plan

#### 1. Ukloni redundansu
- Obriši Hero naslov ("Učenje kroz ponavljanje") — linije 219-225
- Obriši "Ponavljaj" dugme iz Core Stats grid kartice (linije 261-264)
- Zadrži Core Stats brojeve (due count + learned sections) kao čiste brojače

#### 2. Exam Progress Bar (vrh dashboarda)
- Novi widget na vrhu: horizontalna progress traka `learnedSections / totalSections`
- Pored nje kratki status iz plannerData (npr. "Stižeš na vrijeme" ili "Kasniš X dana")
- Objedinjuje Reality Check + Exam Progress u jednu liniju
- Ukloni zasebni `strategicAlert` blok

#### 3. Dnevni Briefing (Insight Box)
- Jedna moderna kartica koja objedinjuje:
  - **Energy-Material Matcher** poruku (doba dana)
  - **Preporuku za danas** iz plannerData (kvota + procjena vremena)
  - **Dnevni cilj** progress (todayReviews/dailyGoal sa streakom)
- Ukloni zasebne widgete za svaki od ova tri elementa
- Kratak brief tekst generisan dinamički: "Danas fokus na X novih sekcija. Kognitivni kapacitet: [Visok/Umjeren/Nizak]."

#### 4. Status Icons Row (upozorenja)
- Zamijeni 4 zasebna upozorenja (Memory Safety, Backup, Storage, Kognitivni dug) jednim horizontalnim redom malih ikona
- Svaka ikona ima boju prema ozbiljnosti (zelena/žuta/crvena)
- Tooltip sa tekstom upozorenja na hover
- Kritična upozorenja (crvena) prikazuju tekst uvijek vidljiv

#### 5. Premjesti tešku analitiku
- Ukloni 14-day Ratio Chart (`DashboardChart`) — prebaciti u Statistike
- Ukloni "Efektivno učenje danas" breakdown — prebaciti u Statistike
- Na dashboardu ostaje samo: "Urađeno danas: X/Y" (već u Dnevnom Briefingu)

#### 6. Cleanup
- Ukloni nekorištene importe: `Play`, `Hand`, `TrendingUp`, `DashboardChart` lazy import
- Ukloni `ratioHistory` i `todayTime` deferred compute koji se više ne koriste
- Props: ukloni `onStartReview` iz interface-a

### Rezultat — Dashboard widgeti (od vrha):
1. **Exam Progress Bar** + status poruka
2. **Core Stats** — dva brojača (due / learned) bez dugmadi
3. **Dnevni Briefing** — brief tekst + progress bar + streak
4. **Idealni Fokus** — dual progress bar (zadrži jer je informativan, bez akcija)
5. **Status Icons Row** — ikone upozorenja sa hover tooltipom

### Fajlovi za izmjenu:
- `src/components/Dashboard.tsx` — kompletna reorganizacija
- `src/components/DashboardChart.tsx` — bez izmjena (ostaje za Statistike)
- `src/views/DashboardPage.tsx` — ukloni `onStartReview` prop

