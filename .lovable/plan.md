# Finale — Web Cleanup + Memory Sanitize (revised)

Zatvara A1c serijal. Cilj: web target nedostupan sa branded CTA, dead-code počišćen, ESLint walls čuvaju invariante, memory odražava SQLite-only realnost.

## Verifikovane premise (post Q&A)

- ✅ `electron/window.cjs:73` učitava `public/splash.html` — **ne brisati**.
- ✅ `src/lib/backup/write-cards-tx.ts` već je čist (sve `db.*` u fajlu su u komentarima koji opisuju stari put). Cijeli `src/lib/backup/` koristi `SqlExecutor.transaction`. **Bez refaktora, bez allowlist-a.**
- ✅ Desktop download URL: `https://github.com/budimirbozovic2-alt/memoria-mne/releases/latest`.

## 1. Web build deprecation finalize

### 1a. Web fallback CTA (`src/main.tsx`)
Inserovati guard prije svih risky importa, odmah nakon error handlera:

```ts
const isDesktopShell = typeof window !== "undefined" && Boolean(window.electronAPI);
if (!isDesktopShell && import.meta.env.PROD) {
  renderDesktopOnlyCta();  // inline funkcija, bez React-a
  // ne mount-uj App, ne pokreći bootDb
} else {
  // postojeći boot path
}
```

`renderDesktopOnlyCta()` zamjenjuje `#root` HTML-om sa:
- CODEX brand gradient pozadina (već postoji u splash blok-u — reusable inline stil),
- Logo `./app-logo-favicon.png`,
- H1: "CODEX je desktop aplikacija",
- Body: "Web verzija je deprecated. Preuzmi desktop build za pun pristup OPFS SQLite bazi i offline radu."
- Primary CTA: `<a href="https://github.com/budimirbozovic2-alt/memoria-mne/releases/latest" class="cta-primary">Preuzmi za desktop</a>`
- Secondary link: "Saznaj više" (anchor na isti URL za sad).

Inline CSS (no Tailwind, no bundle deps). Splash se skida prije render-a CTA.

### 1b. `assertDesktop` ostaje kao defense-in-depth
Postojeći `assertDesktop()` poziv u `main.tsx` ostaje — sad je redundantan jer 1a već short-circuit-uje, ali je jeftina paranoja. Repo-level pozivi u `@/lib/db/queries/*` ostaju (štite od accidental dev/test poziva u web kontekstu).

### 1c. PWA / mobile artifact removal
- **Skinuti**: `public/icon-192.png`, `public/icon-256.png`, `public/icon-512.png` (PWA install ikone, neiskorišćene).
- **Zadržati**: `public/splash.html` (Electron loader), `public/favicon.{ico,png}`, `public/icon-64.png`, `public/icon.ico`, `public/logo-icon.png`, `public/app-logo-favicon.png`, `public/fonts/`, `public/robots.txt`.
- **Zadržati**: SW kill-switch blok u `main.tsx:109-115` (unregistruje legacy SW-ove sa starih posjeta — per PWA docs, ne brisati još jedan release cycle).
- `vite-plugin-pwa` već nije instaliran ✅.

### 1d. Vite `base` provjera
Provjeriti `vite.config.ts`: `base: './'` (zahtjev za Electron `file://`). Ako fali, postaviti.

## 2. Code dead-removal sweep

### 2a. Tooling
`bun add -d knip` + minimalan `knip.json`:
```json
{
  "entry": ["src/main.tsx", "electron/**/*.cjs"],
  "project": ["src/**/*.{ts,tsx}"],
  "ignore": ["src/test/**", "src/**/*.test.{ts,tsx}"]
}
```
`bunx knip` jednom → trijažirati listu ručno (knip ima false positives na dinamičkim importima). **Bez auto-delete.**

### 2b. Targeted sweeps (čisti `rg`, bazirano na deprecation memoriji)

| Cilj | Provjera | Akcija ako pozitivno |
|---|---|---|
| `useLiveQuery` (Core ban) | `rg "useLiveQuery" src/` | mora biti 0 |
| `cardCommandBus` (DEPRECATED) | `rg "cardCommandBus" src/` | repointovati na `useMutation`, obrisati helper |
| `BroadcastChannel` (provider-cleanup-v1 strip) | `rg "new BroadcastChannel" src/` | mora biti 0 van legacy/ |
| `_pendingX = Promise.resolve()` ad-hoc lanci | ESLint već ban-uje (PR1) | repo wide grep |
| Ref-Delta sync mutacije pre SQLite commita | `rg "categoryRecords\..*\s*=\s*" src/lib/repositories/` | obrisati pre-commit ref mutacije |
| `db-seed.migrateFromLocalStorage` | `rg "migrateFromLocalStorage" src/` | ako jedini caller je deprecated `runSchema` grana — obrisati |
| `keyedMutex` instance | `rg "createKeyedMutex" src/` | dokumentovati svaku, obrisati neopravdane (samo non-DB UI flow guards smiju ostati) |

### 2c. Knip post-trijaža
Sve `unused exports` / `unused files` koje knip prijavi → ručno potvrditi i obrisati u tom istom build koraku. Test fajlove ne diramo.

## 3. ESLint walls

Dopuniti `eslint.config.js`. Postojeći `no-restricted-syntax` blok proširiti, dodati `no-restricted-imports`.

### 3a. `no-restricted-imports` — Dexie ban
```ts
"no-restricted-imports": ["error", {
  paths: [
    { name: "dexie", message: "Dexie je deprecated (A1c). Koristi @/lib/db/queries." },
    { name: "dexie-react-hooks", message: "useLiveQuery zabranjen. Koristi TanStack Query." }
  ],
  patterns: [{
    group: ["@/lib/legacy/idb-dexie", "**/legacy/idb-dexie"],
    message: "legacy/idb-dexie je dynamic-import only. Koristi await import()."
  }]
}]
```

**Per-file override** (isti `overrides` pattern kao G7 setTimeout allowlist):
- `src/lib/legacy/**` — shell smije statički import `dexie`
- `src/lib/persistence/sqlite/migrate-from-idb.ts` — migration reader
- `src/test/**` + `src/test/helpers/kb-test-db.ts` — test fixtures

### 3b. `no-restricted-syntax` — direktan `db.<table>` ban
```ts
{
  selector: "MemberExpression[object.name='db'][property.name=/^(cards|sources|mindMaps|mnemonics|categories|knowledgeBaseArticles|settings|drafts|disciplineLog|reviewLog|diary|calibration|latency|slippage|activity|pomodoro|majorSystem|mnemonicTestLog)$/]",
  message: "Direktan db.<table> pristup je zabranjen. Koristi @/lib/db/queries (W6)."
}
```

**Per-file override** (TIGHT — bez backup/ izuzetka):
- `src/lib/legacy/**`
- `src/lib/db/queries/**`
- `src/lib/persistence/sqlite/migrate-from-idb.ts`
- `src/test/**`

Backup/ NIJE u allowlist-u jer je provjereno čist. Bilo koja buduća regresija puca odmah.

### 3c. Verifikacija
`bunx eslint src/ --max-warnings=0` mora proći.

## 4. Memory sanitize

### 4a. Core (`mem://index.md`) — sitno polishe
Postojeći Dexie red proširiti sa: "ESLint walls (`no-restricted-imports` dexie/dexie-react-hooks + `no-restricted-syntax` direktan `db.*`) blokiraju regresije."

### 4b. Pojedinačne memorije (in-place rewrite)
Lovable memory URI rename nije podržan; svi update-ovi su prepisivanja sadržaja + reword opisa u indexu.

| Memorija | Promjena |
|---|---|
| `mem://architecture/sqlite-ssot-cutover` | Dodati top-level "STATUS: DONE — A1c shipped, Dexie removed from runtime, ESLint walls in place". Body ostaje istorijska referenca. |
| `mem://architecture/storage-and-persistence-v6` | URI ostaje (već prepisan kao v7 sadržaj prošlog loop-a). Update `name:` frontmatter na "Storage v7 — SQLite-only", isti opis u indexu. |
| `mem://architecture/idb-ssot-migration` | Već uklonjeno iz indexa. Prepisati telo na single line: "REMOVED — A1c shipped. Vidi `sqlite-ssot-cutover` i `dexie-deprecation-a1c`." |
| `mem://technical-choices/ref-delta-persistence-v4` | Prepisati: "DEPRECATED — vidi `sqlite-ssot-cutover` §B4. Optimistic UI ide kroz `useMutation.onMutate`/`onError`." Index opis: "DEPRECATED → useMutation". |
| `mem://technical-choices/card-command-bus` | Prepisati: "DEPRECATED — per-cardId mutex zamijenjen SQLite ACID. Vidi `sqlite-ssot-cutover` §B8/B11." Index opis: "DEPRECATED → SQLite ACID". |
| `mem://technical-choices/service-layer-pattern` | Prepisati: "DEPRECATED za DB writes — koristi `SqlExecutor.transaction`. `keyedMutex` zadržan samo za non-DB UI flow guards." Index opis: "DEPRECATED → SqlExecutor.transaction". |
| `mem://architecture/dexie-query-strategy` | Već uklonjeno iz indexa. Prepisati telo na: "REMOVED — Dexie je deprecated. Indexed queries ide kroz `@/lib/db/queries` (SQLite)." |
| `mem://architecture/tanstack-query-read-path` | Proširiti: "TanStack QueryClient je SSOT cache za **i read i write** path-ove — `useQuery`/`useSuspenseQuery` za reads, `useMutation` (onMutate/onError rollback) za optimistic writes. Nema paralelnih ad-hoc cache-ova; SSOT storage listeners (`sources-storage`, `mindmap-storage`) su façade-only i bridge `onChange` event-e u `queryClient.invalidateQueries`." Index opis update na isti zaključak. |
| `mem://technical-choices/dexie-query-strategy` | (već gore) |
| `mem://architecture/storage-and-persistence-v6` index linka | Provjeriti da naziv prikazuje "Storage v7" — već je tako ✅. |

### 4c. Cleanup index
Index već ima prazne linije (24, 90, 106) — kozmetičko, ali isto ih sklanjamo radi čistoće.

## 5. Verifikacija

Redoslijed u build modu:
1. `bunx tsc --noEmit` → 0 errors
2. `bunx eslint src/ --max-warnings=0` → pass (novi walls aktivni)
3. `bunx vitest run` → 586/589 (3 pre-existing fail-a nepromijenjeni)
4. `bun run build` → success
5. Bundle audit:
   - `rg -oc "Dexie" dist/assets/App-*.js` ≤ 1 (samo error-msg string)
   - `ls dist/assets/idb-dexie-*.js` postoji
   - App chunk size ~1023 KB (nepromijenjen u odnosu na post-Faza-7 baseline)
6. Manual smoke (preview): `/` u browseru pokazuje CTA stranicu sa GitHub linkom (ne app shell).

## Risk profile

- **ESLint walls (3a/3b)**: mogu otkriti zaboravljene call-sitove. Plan tretira to kao **feature, ne bug** — popravlja se na licu mjesta, ne dodaje allowlist osim za 4 dokumentovana mjesta.
- **Web CTA (1a)**: inline render prije React-a — mora biti samostalan, bez bundle ovisnosti. Stil reusable iz postojećeg splash blok-a.
- **Knip false positives (2a/2c)**: dinamički importi (`@/lib/legacy/idb-dexie`, lazy route chunks) će se prijaviti kao "unused". Trijaža je manualna — ne pratimo slijepo.
- **Memory rewrite (4b)**: in-place update sadržaja + indeks reword. Bez gubitka istorijske reference.
