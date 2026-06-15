# UX P0 — traceability matrix

Datum: 2026-06-14  
Izvor checklist ID-eva: [UX Audit Sprint Plan](../.cursor/plans/ux_audit_sprint_plan_a07a7dc1.plan.md) (Sprint 1 + Review P0)  
Test matrica: [UX Test Matrix plan](../.cursor/plans/ux_test_matrix_7a61a011.plan.md)

Svaki P0 ID mora imati automatski test **ili** dokumentovan manual QA korak.

---

## Source Reader — autosave (P0)

| ID | Feature | Automatski test | Manual QA korak | Status |
|----|---------|-----------------|-----------------|--------|
| SR-P0-1 | Baseline nakon uspješnog save-a | `source-content-autosave.test.tsx` — drugi edit ne triggeruje save | Otvori izvor → edit → sačekaj „Sačuvano” → ponovi isti sadržaj → chip ostaje idle | ✅ |
| SR-P0-2 | Toast na save error | `source-content-autosave.test.tsx` — `toast.error` + store `error` | Mock/offline save → vidi crveni chip + toast „Čuvanje izvora nije uspjelo” | ✅ |
| SR-P0-3 | Exam sidebar baseline tek nakon uspjeha | `source-reader-shell.test.tsx` — debounce persist | U exam sidebaru edit → uspješan save → ponovni blur ne šalje dupli write | ✅ |
| SR-P0-4 | SaveStatusChip u toolbaru | `save-status-chip.test.tsx` — sva stanja uklj. `saved`/`error` | Edit mode → chip dirty → saving → saved → idle | ✅ |
| SR-P0-5 | Dirty guard na Back | `category-view-deep-link.test.tsx` + `source-reader-shell.test.tsx` (confirm flow) | Edit + dirty → Back → confirm dialog; Cancel ostaje u readeru | ✅ |

---

## Category — error surfaces (P0)

| ID | Feature | Automatski test | Manual QA korak | Status |
|----|---------|-----------------|-----------------|--------|
| CAT-P0-1 | `isError` iz sources hook-a | `category-view-deep-link.test.tsx` — mock error status | Simuliraj DB/sources failure → CategoryView ne prikazuje praznu listu | ✅ |
| CAT-P0-2 | Error panel + Retry | `category-view-deep-link.test.tsx` — `FetchErrorPanel` | Klik Retry → `refetchSources` (mock/spy u testu) | ✅ |
| CAT-P0-3 | Deep-link miss toast | `category-view-deep-link.test.tsx` + `pending-source-open.test.ts` | Otvori `/category/:id?openSource=missing` → toast „Izvor nije pronađen” | ✅ |

---

## Cross-cutting (P0)

| ID | Feature | Automatski test | Manual QA korak | Status |
|----|---------|-----------------|-----------------|--------|
| X-P0-1 | Ukloniti emoji iz planner nudge toast-a | `locale-core-flow.test.ts` (static scan) + vizuelni smoke | Planner nudge toast — bez emoji prefiksa | ✅ |
| X-P0-2 | Wire `onExport` na Dashboard | `dashboard-export.test.tsx` | Dashboard → Export → download/dialog se otvara | ✅ |

---

## Review — progress (P0)

| ID | Feature | Automatski test | Manual QA korak | Status |
|----|---------|-----------------|-----------------|--------|
| R-P0-1 | Progress bar off-by-one fix | `review-card-progress.test.tsx` | Sesija 3 kartice — header/progress 1/3, 2/3, 3/3 bez preskoka | ✅ |

---

## Povezani automatski testovi (Sprint 0–3 + follow-up)

| Test fajl | Pokriva |
|-----------|---------|
| `page-header.test.tsx` | Sprint 0 — PageHeader API |
| `locale-core-flow.test.ts` | Sprint 0 — EN copy guard |
| `loading-gates.test.tsx` | Sprint 0/2 — skeleton gate |
| `source-content-autosave.test.tsx` | Sprint 1 — SR-P0-1/2, draft banner |
| `save-status-chip.test.tsx` | Sprint 0/1 — SR-P0-4 |
| `category-view-deep-link.test.tsx` | Sprint 1 — CAT-P0-* |
| `dashboard-export.test.tsx` | Sprint 1 — X-P0-2 |
| `active-phase.test.ts` | Sprint 2 — D-P2-3 (P2, van P0 tabele) |
| `main-layout-immersive.test.tsx` | Sprint 3 — immersive chrome |
| `ui-store-immersive-lifecycle.test.tsx` | Sprint 3 — immersive lifecycle |
| `session-chrome.test.tsx` | Sprint 3 — R-P1-1 shared chrome |
| `review-card-progress.test.tsx` | Sprint 3 — R-P0-1, R-P3-2 |
| `sources-tab-search.test.tsx` | Follow-up — CAT-P2-2 search |
| `title-bar-context.test.tsx` | Follow-up — TitleBar kontekst |
| `source-reader-typography.test.ts` | Follow-up — SR-P3-2 typography store |

---

## Manual QA — brzi smoke (5 min)

1. Dashboard boot → skeleton, ne spinner (`loading-gates.test.tsx` + vizuelno).
2. Category → otvori izvor → edit → save chip + error toast path.
3. Category → pogrešan deep-link ID → toast.
4. Review sesija → progress 1/N tačan.
5. Immersive reader → sidebar/header sakriveni (`main-layout-immersive.test.tsx` + vizuelno).

---

## Napomene

- P0 traceability ne pokriva P1/P2/P3 stavke — one su u sprint planu ali nisu obavezne za ovu matricu.
- `category-mastery-distribution.test.ts` i TD-2 su perf/architektura, ne UX P0 checklist stavka.
