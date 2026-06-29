# P3 — Desktop smoke checklist (TD-ARCH-10)

**Datum:** 2026-06-22  
**Verzija:** post Faza 10 cleanup  
**Automatski proxy:** `npm run test:e2e -- e2e/desktop-smoke-p3.spec.ts`

Playwright smoke pokriva iste tokove u **e2e dev modu** (`VITE_E2E`, OPFS SQLite).  
Electron koraci ispod potvrđuju packaged desktop shell (IPC, splash, file picker).

---

## Automatski (Playwright)

| # | Scenarij | Spec | Status |
|---|----------|------|--------|
| 1 | Cold boot → ready + hydrated cache | `desktop-smoke-p3.spec.ts` | ✅ |
| 2 | Backup export → import roundtrip | isto | ✅ |
| 3 | Brisanje prazne kategorije | isto | ✅ |
| 4 | Review sesija (due card → start) | isto | ✅ |
| 5 | Stats + Planner tab (deferred analytics) | isto | ✅ |

```bash
cd memoria-mne
npm run test:e2e:install   # jednom
npm run test:e2e -- e2e/desktop-smoke-p3.spec.ts
```

---

## Ručno (Electron desktop)

Pokreni packaged build ili `npm run electron` nakon `npm run build`.

| # | Korak | Očekivano | ✓ |
|---|-------|-----------|---|
| 1 | **Cold boot** — zatvori app, ponovo otvori | Splash → dashboard, bez greške u konzoli | ☐ |
| 2 | **Import backup** — Dashboard → Backup → uvezi `.json` backup | Toast uspjeh, kartice/kategorije vidljive | ☐ |
| 3 | **Category delete** — Kategorije → obriši test kategoriju | Kategorija nestaje, cache se osvježava | ☐ |
| 4 | **Review session** — Ponavljanje → odaberi mod → Počni | Kartica se prikaže, ocjena se snimi | ☐ |
| 5 | **Stats / Planner** — otvori oba taba | Grafici/planer se učitaju bez freeze-a (deferred compute) | ☐ |

---

## Napomene

- Web PROD build prikazuje „Preuzmi desktop“ CTA — smoke je **desktop-only**.
- Playwright ≠ Electron: IPC i native file picker provjeri ručno u koraku 2.
- Ako Playwright padne na review setupu, provjeri da due fixture ima `nextReview` u prošlosti.
