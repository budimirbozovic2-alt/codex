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

Dev server se podiže automatski (`playwright.config.ts` → `webServer`) na portu **8080** sa COOP/COEP headerima. U E2E modu (`VITE_E2E=1`) SQLite koristi `:memory:` umjesto OPFS jer headless Chromium nema pouzdan OPFS pristup.

## Testovi

| Spec | Scenarij |
|------|----------|
| `e2e/source-reader-edit.spec.ts` | Otvori izvor → Uredi → tipkanje → čekaj „Sačuvano” |
| `e2e/source-reader-edit.spec.ts` | Selekcija teksta → bubble menu „Esej” vidljiv |
