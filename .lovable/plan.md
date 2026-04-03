

# GlobalSearch keširanje + ReviewSession IDB migracija

## 1. GlobalSearch — keširanje naslova izvora i mindmap-a

### Problem
Svaki put kad se otvori search (`open=true`), pozivaju se `loadSources()` i `loadMindMaps()` koji dohvataju kompletne kolekcije iz IDB-a. Za veliku bazu ovo je sporo.

### Rješenje
Keširati naslove u module-level varijablama. Pri prvom otvaranju učitati iz IDB-a, zatim koristiti keš. Event bus signal `CARDS_UPDATED` invalidira keš.

### Promjene: `GlobalSearch.tsx`
- Dodati module-level `let cachedSources: Source[] | null = null` i `let cachedMindMaps: MindMapDoc[] | null = null`
- U `useEffect` koji se trigerira na `open`: koristiti keš ako postoji, inače loadati i postaviti keš
- Dodati event bus listener za invalidaciju keša (`SOURCES_UPDATED` signal — provjeriti da li postoji, ako ne, koristiti prazan interval od 60s za stale check)

## 2. ReviewSession — migracija sa localStorage na IDB

### Problem
`ReviewSession` koristi `localStorage` za pause/resume sesije dok ostatak aplikacije koristi IDB. Nekonzistentno.

### Rješenje
Zamijeniti `localStorage.getItem/setItem/removeItem(SESSION_KEY)` sa `idbLoadSettings/idbSaveSettings` pozivima. Zadržati isti ključ i format podataka.

### Promjene: `ReviewSession.tsx`
- Mount `useEffect`: zamijeniti sinhroni `localStorage.getItem` sa asinhronim `idbLoadSettings<SavedSessionState | null>(SESSION_KEY, null)` — dodati `.then()` za postavljanje `savedSession`
- `clearSavedSession`: pozivati `idbSaveSettings(SESSION_KEY, null)` umjesto `localStorage.removeItem`
- `saveSessionState`: pozivati `idbSaveSettings(SESSION_KEY, state)` umjesto `localStorage.setItem`
- Dodati localStorage→IDB migraciju (isti pattern kao `loadLearnProgress`): ako IDB prazan, provjeriti localStorage, migrirati i obrisati

## Fajlovi

| Fajl | Promjena |
|------|----------|
| `src/components/GlobalSearch.tsx` | Module-level cache za sources/mindmaps |
| `src/components/ReviewSession.tsx` | localStorage → idbSettings migracija |

## Scope
- 2 fajla, ~40 linija neto promjena
- Nema novih zavisnosti
- Backward-compatible (migrira postojeće localStorage podatke)

