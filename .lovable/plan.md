## Izvještaj o stanju funkcionalnosti

### Refaktor pod nadzorom
`src/lib/body-pointer-events-guard.ts` (+ instalacija u `src/App.tsx`) — globalni guard protiv Radix `pointer-events: none` leak-a na `<body>`. rAF coalesced, sa preciznom detekcijom otvorenih overlay-a.

### Test suite (392/396 = 98.99% prolazi)

Svi novi i postojeći testovi vezani za refaktor prolaze:
- `body-pointer-events-guard.test.ts` — 3/3
- `body-pointer-events-overlay-detection.test.ts` — 18/18
- `dialog-pointer-events-e2e.test.tsx` — 3/3
- `card-import-flow-e2e.test.tsx` — 3/3 (uvoz, bulk + Escape, kreacija)

### Pre-existing failovi (NISU posljedica refaktora)

| Test | Datoteka | Domen |
|---|---|---|
| backup-schema passthrough | `backup-schema.test.ts:55` | Backup schema (Zod passthrough) |
| backlink index — emit per-create | `zettelkasten-wiki-link-integration.test.ts:206` | Zettelkasten backlink versioning |
| backlink index — version bump on upsert | `:261` | Zettelkasten backlink versioning |
| backlink index — removal version bump | `:300` | Zettelkasten backlink versioning |

Svi se odnose na nepovezane module (Zettelkasten backlink index, backup schema). Guard ne dira ni jednu od tih putanja.

### Potencijalni rizici refaktora (analiza koda)

1. **`isOverlayOpen()` selektor `[data-radix-focus-guard]`** — pokriva SVE Radix dismissable layere (Dialog, Popover, DropdownMenu, Select, ContextMenu, Tooltip-modal). Ovo je **ispravno** — body ostaje lock-ovan dok god je legitimni overlay otvoren; čisti se tek kad svi nestanu.

2. **`treeObserver` na `body { childList:true, subtree:true }`** — fires na svaku DOM mutaciju u app-u. Callback je trivijalan (filter `removedNodes` po atributu) i schedule je rAF-coalesced (max 1×/frame). U najgorem slučaju jedan dodatni `getAttribute` poziv po mutaciji — zanemarivo.

3. **StrictMode double-mount** — `installed` singleton: prvi mount instalira, drugi vraća postojeći `dispose`. Prvi unmount disconnect-uje observere i postavlja `installed = null`; drugi unmount poziva `dispose` na već disconnect-ovanim observerima (no-op safe). Pravi mount nakon toga instalira čisto. **Bez leak-a, bez duplog observera.**

4. **`data-scroll-locked` na `<body>`** — guard ovo poštuje. `react-remove-scroll` skida atribut pri unlock-u; observer hvata promjenu i čisti pointer-events.

5. **App.tsx integracija** — `useEffect(() => installBodyPointerEventsGuard(), [])` korektno vraća `dispose` kao cleanup.

### Funkcionalnosti koje refaktor MOŽE poboljšati (a ne ograničava)
- Kreacija/uvoz kartica (Essay i Flash) — UI više ne zaključava nakon close ✓
- Bulk uvoz (zip workers) — nakon toast/progress dialoga UI ostaje klikabilan ✓
- Bilo koji Radix Dialog/AlertDialog/Sheet/Vaul Drawer u app-u — dijeli isti benefit

### Funkcionalnosti koje refaktor NE dira
Auth, AppContext, Dexie storage layer, FSRS, Zettelkasten, Mind Maps, Planner, TTS, Speed Reader, Memorization, Backup/Restore, Search, Card Command Bus — sve van scope-a guard-a.

### Preporuka
Refaktor je **bez regresija**. Preporučujem u sljedećem koraku:
- **Live smoke test u browseru** (`navigate_to_sandbox` + reproducir kreaciju kartice) da se vizualno potvrdi rješenje na pravom build-u.
- (Opciono) Posebno popraviti 4 pre-existing test failure-a u Zettelkasten backlink/backup schema — odvojen task, nije blocker za pointer-events refaktor.

Želiš li da pokrenem live smoke test u preview-u, ili da napravim odvojen task za 4 nepovezana failing testa?
