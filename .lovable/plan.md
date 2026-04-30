## Plan: Razbijanje `AppContext.tsx` God Object

### Cilj
Mehanički podijeliti 502-linijski `src/contexts/AppContext.tsx` u izolovane module po domenima. **Nikakva poslovna logika se ne mijenja** — samo se premješta. Sve postojeće javne API tačke (`useCardData`, `useCardActions`, `useCategoryData`, `useReviewData`, `useUIContext`, `usePomodoroStable`, `usePomodoroTick`, `usePomodoroContext`, `useCurrentView`, `AppProvider`, tip `View`, tip `PomodoroState`) ostaju eksportovane iz `@/contexts/AppContext` da se ne razbije nijedan od **34 fajla** koji ih trenutno importuju.

### Nova struktura

```text
src/contexts/
├── AppContext.tsx                 (~70 linija — composition root + re-exporti)
├── routing/
│   └── useCurrentView.ts          (View enum, VIEW_TO_PATH, PATH_TO_VIEW,
│                                   useCurrentView, VIEW_ACTIVITY_MAP)
├── pomodoro/
│   ├── usePomodoroEngine.ts       (useGlobalPomodoro hook + tipovi)
│   └── PomodoroProvider.tsx       (PomodoroStableContext, PomodoroTickContext,
│                                   usePomodoroStable/Tick/Context, Provider)
├── ui/
│   ├── useNotificationScheduler.ts (useEffect za dnevni Notification trigger)
│   ├── useActivityTracker.ts      (useEffect-i za recordFirstAction +
│   │                                VIEW_ACTIVITY_MAP timing)
│   └── UIProvider.tsx             (UIContext, useUIContext, UIProvider —
│                                   poziva oba hook-a iznad)
└── cards/
    └── CardProvider.tsx           (sva 4 konteksta: CardState, Category,
                                    Review, CardActions + Proxy factory +
                                    EMPTY fallback objekti + hooks)
```

### Mapa premještanja (linija → fajl)

| Trenutne linije AppContext.tsx | Cilj |
|---|---|
| 14–34 (View tip, mape, useCurrentView, VIEW_ACTIVITY_MAP) | `routing/useCurrentView.ts` |
| 37–42 (PomodoroState), 195–303 (useGlobalPomodoro) | `pomodoro/usePomodoroEngine.ts` |
| 198–235, 400–417 (Pomodoro konteksti, hookovi, Provider) | `pomodoro/PomodoroProvider.tsx` |
| 428–459 (notification scheduler useEffect) | `ui/useNotificationScheduler.ts` |
| 461–475 (activity tracker useEffect-i) | `ui/useActivityTracker.ts` |
| 176–190, 419–490 (UIContext + UIProvider) | `ui/UIProvider.tsx` |
| 47–171 (sva 4 konteksta + hooks + EMPTY) i 309–398 (CardProvider + Proxy) | `cards/CardProvider.tsx` |
| 492–502 (AppProvider + composition) | `AppContext.tsx` (ostaje) |

### `AppContext.tsx` nakon refaktora (~70 linija)

Fajl ostaje na istoj putanji da svih 34 importera nastave da rade nepromijenjeno. Sadržaj:

- **Re-eksporti** (sve iz novih fajlova):
  - `View`, `useCurrentView` iz `./routing/useCurrentView`
  - `PomodoroState`, `usePomodoroStable`, `usePomodoroTick`, `usePomodoroContext` iz `./pomodoro/PomodoroProvider`
  - `useUIContext` iz `./ui/UIProvider`
  - `useCardData`, `useCardActions`, `useCategoryData`, `useReviewData` iz `./cards/CardProvider`
- **Composition root** `AppProvider` koji wrapuje children u `CardProvider` → `PomodoroProvider` → `UIProvider` (isti redoslijed kao sada).

### Tehnička pravila izvršenja

1. **Zero logic change** — copy-paste linija je verbatim. Imports unutar svakog novog fajla se uskladi (npr. `useCardActions` u `UIProvider` se importuje iz `../cards/CardProvider`).
2. **Tipovi se kreću zajedno sa kontekstom kojem pripadaju** (`PomodoroState` u pomodoro modul, `View` u routing modul itd.).
3. **`EMPTY_*` fallback konstante** ostaju uz svoje kontekste u `cards/CardProvider.tsx`.
4. **Proxy-based action factory** (linije 313–342) ostaje 1:1, samo se premješta.
5. **HMR/Refresh stabilnost** — splitanje rješava i trenutnu `useCardActions must be used within CardProvider` HMR grešku jer će svaki provider imati vlastitu modulnu granicu (Vite Fast Refresh briše state samo za izmijenjeni fajl).
6. **Cyclic imports check** — jedini cross-modul import: `UIProvider` zove `useCardActions()` iz `cards/`. To je jednosmjerno, bez ciklusa.
7. **Bez izmjena u 34 fajla potrošača** — svi nastavljaju da importuju iz `@/contexts/AppContext`.

### Out of scope
- `spaced-repetition.ts` (Korak 6) — biće zaseban prompt nakon što ovaj prođe.
- Nikakve preimenovane API tačke, nikakvi novi feature-i, nikakve TypeScript optimizacije.

### Verifikacija
- TypeScript kompajlira bez grešaka.
- 34 fajla koja importuju iz `@/contexts/AppContext` rade bez izmjena.
- Pomodoro nastavlja tikati, notifikacije se emituju, view tracking radi.
- HMR error iz preview-a nestaje jer `CardProvider` više ne dijeli modul sa nepovezanim hookovima.
