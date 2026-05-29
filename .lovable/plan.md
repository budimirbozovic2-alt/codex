
## Pronalazak

### Bug #1 — "Nova kartica" 404 ✅ root cause potvrđen
`src/views/DashboardPage.tsx:38` → `setView("create")` → `navigate("/create")` → ruta `/create` ne postoji u `App.tsx`.

### Bug #2 — "Strateški planer" 404 — interesantan nalaz
Pretražio sam **cijeli `src/`** za string `/planer` (bez drugog `n`) — `grep -rEn '"/planer"|/planer[^n]|/planer$' src/` — i **nema nijednog hit-a u izvornom kodu**. Sve referencije su `"/planner"` (ToolCards, MainLayout, Breadcrumbs).

To znači da typo `/planer` koji vidiš u console-u dolazi iz **starog buildovanog `dist/`** koji još uvijek koristi instalirana Electron aplikacija (svježi `vite build` neće reproducirati grešku jer source je čist). Praktično: bug je verovatno već popravljen u izvoru u nekom ranijem commitu, ali tvoj instalirani `.exe`/`.dmg` ima stari bundle.

---

## Popravke

### 1. Empty dashboard CTA → otvori Onboarding modal

`src/views/DashboardPage.tsx`:
- Ukloniti `onAction={() => setView("create")}` (mrtva ruta).
- Promijeniti u `onAction={() => setShowOnboarding(true)}` — koristi već postojeći `OnboardingModal` koji je već lazy-loaded u istoj komponenti.
- `actionLabel` po potrebi promijeniti u npr. "Počni vodič" da odražava namjeru (provjerit ću trenutni label u `EmptyState`).

Bonus: na kraju onboarding-a (`onComplete`), navigirati korisnika na `/categories` da kreira prvi subject — to logički zatvara flow "prazan dashboard → vodič → kreiraj kategoriju → dodaj kartice".

### 2. Planner — defensive alias + svjež build

Pošto izvor ne sadrži typo, jedini siguran fix je:
- **Rebuild i reinstall Electron app** sa svježim `dist/` (ovo je glavno rješenje).
- **Defensive alias** u `App.tsx`: dodati `<Route path="/planer" element={<Navigate to="/planner" replace />} />` da pokrije sve eventualne preostale stale linkove (interne ili eksterne bookmark-e). Cijena: jedna linija, nula maintenance.

### 3. Sanity cleanup — mrtve mape u UIProvider

`src/contexts/routing/useCurrentView.ts`:
- Ukloniti `create: "/create"` iz `VIEW_TO_PATH` (i `"create"` iz `View` union-a) jer ne postoji ruta. Time se sprečava budući regres istog tipa — TypeScript će uhvatiti svaki `setView("create")` poziv.
- Provjeriti sve call-site `setView(...)` (kratak grep) i prilagoditi ako još neko zove `"create"`.

---

## Verifikacija

1. **Build**: `bunx vite build` — provjeriti da nema TS grešaka oko uklonjenog `"create"` view-a.
2. **Smoke u preview-u**: na `/` (prazan dashboard) klik EmptyState → otvara se OnboardingModal, ne 404.
3. **Planer**: u preview-u (svjež bundle bez typo) klik ToolCards → `/planner` se otvara čisto. Defensive alias provjeriti ručno: navigacija na `#/planer` redirektuje na `#/planner`.
4. **Tests**: postojeći `category-view-contract.test.ts` i `category-view-loading.test.tsx` — sanity da ostale rute rade.

## Fajlovi

- `src/views/DashboardPage.tsx` — onAction → onboarding
- `src/contexts/routing/useCurrentView.ts` — ukloniti `"create"` view + path
- `src/App.tsx` — dodati `/planer` → `/planner` redirect alias
- (opciono) `src/components/EmptyState.tsx` — label refinement ako trenutni ne odgovara

## Out of scope

- Bez promjena na `EditPage`, `PlannerPage` ili `StrategicPlanner` (rade ispravno).
- Bez novih ruta `/create` — odluka je da global "create" ne postoji; kartice se kreiraju per-subject.
