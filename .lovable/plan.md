## Cilj

Ukloniti "Konsolidacija" iz navigacije. Zadržati je kao akciju na oba dashboarda:
- **Globalni dashboard**: naziv "Globalna konsolidacija", automatski u modu "critical" (bez izbora kategorije, bez izbora moda)
- **Lokalni dashboard**: sve 3 opcije ostaju (stabilization, critical, hardest), kategorija auto-zaključana — bez promjena u ponašanju

## Promjene

### 1. Ukloniti iz navigacije

**`src/components/TopNav.tsx`** — ukloniti `{ path: "/review", ... }` iz `PRIMARY_NAV`.

**`src/components/AppSidebar.tsx`** — ukloniti `{ path: "/review", ... }` iz `STATIC_NAV`.

**`src/views/DashboardPage.tsx`** — ukloniti "Konsolidacija / R" red iz InfoPanel prečica.

### 2. Auto-mode parametar

**`src/views/ReviewPage.tsx`** — čitati `mode` param iz URL-a (`?mode=critical`). Proslijediti ga kao `autoMode` prop u `ReviewSession`.

**`src/components/ReviewSession.tsx`** — novi opcionalni prop `autoMode?: ReviewMode`. Kada je prisutan, preskočiti `ReviewSetup` — odmah izračunati stavke za taj mod (koristeći postojeći `computeItemsForMode`) i startovati sesiju.

### 3. Globalni Dashboard

**`src/components/dashboard/QuickActions.tsx`** — link postaje `/review?mode=critical`. Tekst: "Globalna konsolidacija ({count})". Dodati prop `criticalCount` za prikaz broja sekcija na granici zaborava umjesto `dueCount`.

**`src/components/Dashboard.tsx`** — izračunati `criticalCount` (sekcije sa R ≈ 80-85%, ista logika kao u `ReviewSetup`) i proslijediti u `QuickActions`.

### 4. Lokalni Dashboard — bez promjena

**`src/views/SubjectDashboard.tsx`** — URL ostaje `/review?category=${categoryId}` (bez `mode` parametra). `ReviewSetup` se prikazuje normalno sa sva 3 moda.

### 5. Ruta ostaje

`/review` ruta u `App.tsx` ostaje netaknuta — pristupa joj se samo preko dashboard akcija.

## Što se NE mijenja

- `ReviewSetup.tsx` — tri moda, filteri, `lockedCategory` logika
- `ReviewCard`, `ReviewComplete`, `SessionFilters`
- FSRS algoritam i `onReviewSection`
- Lokalni dashboard akcija "Učenje uz aktivno prisjećanje"
