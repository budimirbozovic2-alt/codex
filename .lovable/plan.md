

# Razdvajanje cognitive-analytics.ts na domenske module

## Rezime
Razdvajamo monolitni `cognitive-analytics.ts` (552 linija, 9 nezavisnih funkcija) na 5 fokusiranih modula. Svaki modul grupiše tematski srodne funkcije. Originalni fajl postaje re-export barrel za backward kompatibilnost.

## Novi moduli

| Modul | Funkcije | ~Linije |
|-------|----------|---------|
| `src/lib/analytics/interference.ts` | `calcInterferencePairs` | ~120 |
| `src/lib/analytics/stability.ts` | `calcCategoryStability`, `calcStrategicRealityCheck` | ~90 |
| `src/lib/analytics/friction.ts` | `calcFrictionAnalysis`, `calcStressPerformance` | ~100 |
| `src/lib/analytics/blind-spots.ts` | `calcBlindSpots`, `calcWeakHooks` | ~100 |
| `src/lib/analytics/recovery.ts` | `calcRecoveryRate`, `calcEnergyRecommendation` | ~80 |

## Promjene u potrošačima

**Nema promjena** — `cognitive-analytics.ts` postaje barrel fajl:
```ts
export { calcInterferencePairs, type InterferencePair } from "./analytics/interference";
export { calcCategoryStability, type CategoryStabilityInfo, ... } from "./analytics/stability";
// ... itd.
```

Dva potrošača (`CognitiveAnalytics.tsx` i `useDashboardData.ts`) nastavljaju da importuju iz `@/lib/cognitive-analytics` bez promjena.

## Scope
- 5 novih fajlova u `src/lib/analytics/`
- 1 fajl pretvoren u barrel (`cognitive-analytics.ts`: 552→~20 linija)
- 0 promjena u potrošačima
- Nema novih zavisnosti
- FSRS: netaknut

