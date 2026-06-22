# E2E fixtures — Source Reader

Playwright smoke testovi za Source Reader koriste deterministički seed preko `window.__codexE2E` (aktivno samo kad je `VITE_E2E=1`, npr. `vite --mode e2e`).

## Fixture ID-evi

| Entitet | ID | Naslov / ime |
|---------|-----|--------------|
| Kategorija | `e2e-cat-reader` | E2E Reader Kategorija |
| Izvor | `e2e-src-reader` | E2E Test Izvor |

Konstante: [`src/e2e/seed-reader-fixture.ts`](../src/e2e/seed-reader-fixture.ts).

## Seed tok

1. `bulkPutCategories` — upsert kategorije u SQLite
2. `setCategoryStoreRecords` — ažurira Zustand category store
3. `saveSource` — upsert izvora + `emitDomainChanged({ domain: "sources" })`
4. Invalidacija TanStack query-ja: `sources` po kategoriji + `masteryDist` po kategoriji

## Pokretanje

```bash
cd memoria-mne
npm install
npx playwright install chromium
npm run test:e2e
```

Dev server se podiže automatski (`playwright.config.ts` → `webServer`) na portu **8080** sa `--mode e2e`. U E2E modu (`VITE_E2E=1`) SQLite koristi in-memory wasm executor u rendereru (`src/e2e/browser-memory-sqlite.ts`).

## Testovi

| Spec | Scenarij |
|------|----------|
| `e2e/source-reader-edit.spec.ts` | Otvori izvor → Uredi → tipkanje → čekaj „Sačuvano” |
| `e2e/source-reader-edit.spec.ts` | Selekcija teksta → bubble menu „Esej” vidljiv |
| `e2e/persistence-restart.spec.ts` | Seed kartica → simulirani restart sesije → kartica u UI |

## Persistence fixture ID-evi

| Entitet | ID |
|---------|-----|
| Kategorija | `f1111111-1111-4111-8111-111111111111` |
| Kartica | `f2222222-2222-4222-8222-222222222222` |

Konstante: [`src/e2e/seed-persistence-fixture.ts`](../src/e2e/seed-persistence-fixture.ts).

`simulateSessionRestart()` briše TanStack keš i ponovo pokreće boot DAG — SQLite podaci ostaju u E2E in-memory bazi (isti simptom kao „restart app“ bez gubitka DB fajla).
