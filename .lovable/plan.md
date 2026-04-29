# Standardizacija pisanja query parametara (canonical writers)

## Stanje danas

Iz prethodne runde čitači su već svi prešli na `getParam` (kanonski + alias fallback). Sada treba dovršiti **stranu pisanja**: svaka navigacija/Link koji ručno sklapa query string treba ići preko `buildQuery`, da pisači ostanu u sinhronu sa kanonskim imenima i da nema više ručnih `?cat=` ili copy-paste šablona.

Routing po path-segmentima (`/subject/:id`, `/category/:id`, `/subject/:id/cards`, `/subject/:id/zettelkasten`, `/subject/:id/mind-maps`) je **već kanonski** i ostaje netaknut — to nisu query parametri.

## Šta tačno ostaje za ispraviti

Pretragom `URLSearchParams` + `?category=` + `&category=` u `src/`, ostala su samo dva mjesta gdje pisači još uvijek ručno sklapaju query:

1. **`src/views/SubjectDashboard.tsx`**
   - Linija 44–53 `handleMatrixStart`: ručno gradi `URLSearchParams` sa `category`, `subcategory`, `mode`, `type`, `freq`, `sort`.
   - Linija 118 `coreActions`: `to: \`/review?category=${categoryId}\``.
   - Linija 174 settings link: `to={\`/settings?tab=algorithm&category=${categoryId}\`}`.

Sve tri tačke prebaciti na `buildQuery` iz `src/lib/url-params.ts`.

## Plan izmjena

### 1) `src/views/SubjectDashboard.tsx`

- Importovati `buildQuery` iz `@/lib/url-params`.
- `handleMatrixStart` zamijeniti sa:
  ```ts
  const qs = buildQuery({
    category: categoryId,
    mode: "strict-recall",
    subcategory: f.subcategoryId,
    type: f.type,
    freq: f.frequencyTag,
    sort: f.sortMode,
  });
  navigate(`/learn${qs}`);
  ```
- `coreActions` review entry: `to: \`/review${buildQuery({ category: categoryId })}\``.
- Settings link: `to={\`/settings${buildQuery({ tab: "algorithm", category: categoryId })}\`}`.

### 2) `src/lib/url-params.ts` (manja dopuna aliasa)

Dodati ne-kategorijske, ali kanonski-važne ključeve koje pisači sada koriste, da se readeri u budućnosti mogu lako vezati na njih bez novih izmjena:
- `tab: ["tab"]`
- `mode: ["mode"]`
- `type: ["type"]`
- `freq: ["freq", "frequency"]`
- `sort: ["sort"]`

Ovo je čisto dodavanje — postojeći `getParam` pozivi nastavljaju raditi.

### 3) Lint / sanity provjera

Nakon izmjena u dashboardu, preko `rg` se potvrđuje da u `src/` više nema:
- ručnog `new URLSearchParams()` osim u `url-params.ts`,
- ni jednog hard-coded `?category=` / `&category=` izvan `url-params.ts` testova.

Čitači (`LearnPage`, `ReviewPage`, `SRSettingsPanel`) ostaju netaknuti — već koriste `getParam`.

## Šta se NE dira

- Path-segment rute (`/subject/:id/...`, `/category/:id`) — to nisu query params i već su kanonske.
- Backward-compat aliasi (`cat`, `sub`, `subject`) ostaju u `ALIASES` da stari bookmarkovi rade zauvijek.
- Logika `EditReturnSnapshot`, `LearnSession`, `ReviewSession` — bez promjena.

## Rezultat

Svi novi linkovi/redirekcije u aplikaciji idu kroz jedan helper (`buildQuery`) i koriste isključivo kanonska imena (`category`, `subcategory`, `tab`, `mode`, `type`, `freq`, `sort`). Eventualno buduće preimenovanje aliasa svodi se na izmjenu jedne mape u `url-params.ts`.
