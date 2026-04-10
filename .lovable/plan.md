

# Plan: Pokretanje testova stabilnosti

## Šta će se desiti
Pokrenuću sve postojeće testove (7 test fajlova) koristeći `vitest run` da provjerim stabilnost aplikacije nakon nedavnih promjena (state reset u CategoryView, chapter sorting u SessionFilters, sidebar refaktoring).

## Testovi koji postoje
1. **spaced-repetition.test.ts** — FSRS v5 algoritam
2. **planner-logic.test.ts** — Strateški planer
3. **source-coverage.test.ts** — Source coverage analiza
4. **auto-split.test.ts** — Auto-split engine
5. **selection-split.test.ts** — Selection split
6. **persist-queue-c3c4.test.ts** — Persist queue sigurnost
7. **example.test.ts** — Smoke test

## Akcija
Jedna komanda: `npx vitest run` — izvršava sve testove i prikazuje rezultate.

