
## Cilj

Eliminisati `any` iz import/backup putanje kroz Zod validaciju, i pretvoriti "Zero-any" memoriju u tooling-enforced pravilo. Trenutno stanje: `useCardImport.ts` ima 6 `any`, `useCardExport.ts` 2, ukupno ~59 `any` u 24 fajla. ESLint trenutno ne provjerava `no-explicit-any`.

Strategija je **scoped zaključavanje**: striktno blokiramo `any` u kritičnim putanjama odmah, a ostatak codebasea dobija upozorenje (warn) sa planom postepene migracije — da ne razbijemo CI dok migriramo 50+ ostalih lokacija.

---

## 1. Instalacija Zod

```
bun add zod
```

Zod je tree-shakeable (~12KB gz), nema runtime zavisnosti. Već je pomenut u memoriji o input-validation.

---

## 2. Novi fajl: `src/lib/migrations/backup-schema.ts` (proširenje)

Postojeći fajl ima samo `MinimalBackup` interfejs i `isMinimalBackup` type-guard. Proširujemo ga sa **kompletnim Zod schemama** za sve table-ove koji prolaze kroz import:

- `BackupSectionSchema` — id, title, content, FSRS polja sa defaultima
- `BackupCardSchema` — id, question (sanitized), sections, kategorije, opcione FSRS metaдate; `frequencyTag`/`sourceType` kao `z.enum`
- `BackupCategoryRecordSchema` — uključuje `examinerProfile` sa enum-ima `tezak|lak` i `esej|definicija|potpitanja`
- `BackupSourceSchema` — `htmlContent` ide kroz `.transform(sanitizeHtml)`
- `BackupMindMapSchema` — `nodes`/`edges` sa `data.label`/`data.description` sanitized
- `BackupMnemonicSchema`, `BackupKnowledgeBaseArticleSchema`
- `BackupReviewLogEntrySchema`, `BackupSRSettingsSchema`
- `BackupLocalStorageDataSchema` — `z.record(z.string(), z.unknown())` sa whitelistom u helperu
- **`BackupSchema`** — top-level objekat: `version`, `type`, sve table-ove kao `.optional().default([])`

Stari `MinimalBackup` interfejs i `isMinimalBackup` ostaju (koriste ih remap-from-backup migracije) — refaktorišemo ih da budu `z.infer<typeof MinimalBackupSchema>`.

**Ključno:** schema koristi `.passthrough()` za nepoznata polja gdje god je potrebno (npr. legacy backup-ovi sa custom poljima koja smo pre-FSRS imali) — ne želimo da odbacimo validne backup-ove zbog `version: 3` polja koje danas više ne postoji.

Coercion strategija: `z.coerce.number().default(...)` za FSRS brojeve, `.transform(sanitizeHtml)` za sve HTML stringove (jednom mjesto = single source of truth za XSS sanitizaciju).

---

## 3. Refactor: `src/hooks/useCardImport.ts`

Zamjena svih 6 `any` lokacija:

| Linija | Prije | Poslije |
|---|---|---|
| 86 | `(c: any): Card` | `(c: z.infer<typeof BackupCardSchema>): Card` (uklonjen, BackupSchema već radi migraciju kroz `.transform()`) |
| 97 | `(s: any)` | uklonjen — sekcije parsa schema |
| 197 | `(data.sources as any[]).forEach` | `parsed.sources.forEach` (tipovan kao `BackupSource[]`) |
| 203 | `(data.mnemonics as any[]).forEach` | isto |
| 209 | `(data.knowledgeBaseArticles as any[]).forEach` | isto |
| 234 | `subcategories: [] as any[]` | `subcategories: [] as SubcategoryNode[]` |
| 270 | `((r.subcategories \|\| []) as any[]).map((n: any) => ...)` | `r.subcategories.map(n => n.name)` (tip je `SubcategoryNode[]`) |
| 293 | `(data.sources as any[]).map((src) => ...)` | `parsed.sources.map(src => ...)` |
| 308–317 | sanitizedMindMaps sa 3× `any` | uklonjeno — sanitization premještena u Zod `.transform()` na `BackupMindMapSchema` |

Glavna struktura nove `importData`:

```ts
const raw = JSON.parse(jsonText);
const result = BackupSchema.safeParse(raw);
if (!result.success) {
  toast.error(`Backup nije validan: ${result.error.issues[0]?.message ?? "nepoznata greška"}`);
  return;
}
const parsed = result.data; // FULLY TYPED, sanitized, defaults applied
// ostatak importData više ne treba sanitizeHtml/migrateImported/sanitizeExaminerProfile
```

Brisanje pomoćnih funkcija koje sad rade unutar Zod-a:
- `sanitizeFrequencyTag` → `z.enum(FREQUENCY_TAG_VALUES).optional()`
- `sanitizeSourceType` → isto
- `sanitizeExaminerProfile` → ugrađeno u `BackupCategoryRecordSchema`
- `migrateImported` → ugrađeno u `BackupCardSchema.transform()`

Krajnji `useCardImport.ts` ima **0 `any`** i pada sa ~486 LOC na ~280 LOC zato što sva validacija živi u schema fajlu.

---

## 4. Refactor: `src/hooks/useCardExport.ts`

Linija 85, 89: `deriveSubMap` prima `{ name; subcategories?: any[] }[]`. Mijenjamo u `CategoryRecord[]` (već postoji import). Subcategories su `SubcategoryNode[]` po šemi v9+, nema više legacy `string[]` reprezentacije u export putanji. Ako legacy backup ipak stigne, type-guard:

```ts
function deriveSubMap(catRecords: CategoryRecord[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of catRecords) {
    if (r.subcategories?.length) out[r.name] = r.subcategories.map(s => s.name);
  }
  return out;
}
```

0 `any` u `useCardExport.ts`.

---

## 5. ESLint enforcement: `eslint.config.js`

Dodajemo dva sloja:

**Layer A (global, warn):** `@typescript-eslint/no-explicit-any: "warn"` u glavnom rules bloku — vidljivost u IDE-u za svih 50+ ostalih `any` koje nećemo migrirati u ovoj iteraciji.

**Layer B (scoped, error):** novi config blok koji **fail-uje build** za kritične putanje:

```js
{
  files: [
    "src/hooks/useCardImport.ts",
    "src/hooks/useCardExport.ts",
    "src/lib/migrations/**/*.ts",
    "src/lib/sanitize.ts",
    "src/lib/persist-queue.ts",
    "src/contexts/cards/**/*.{ts,tsx}",
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
  },
}
```

Razlog za 2 sloja: globalni `error` bi trenutno failovao CI sa 59 grešaka u testovima/workerima/ErrorBoundary-ju koji nisu dio ove iteracije. Scoped `error` znači da se kritične putanje ne mogu regresirati, a globalni `warn` daje migration tracking listu bez razbijanja CI-ja.

---

## 6. CI fail-on-warn (opcionalno, preporučeno)

`package.json` lint script:

```json
"lint": "eslint . --max-warnings=59"
```

Postavljamo trenutni warning-count kao plafon. Svaki novi `any` koji neko doda → CI pada. Postojeći se ne moraju migrirati odmah, ali ne mogu rasti. Ovo je **ratchet pattern** — broj može samo da pada, nikad ne raste. Kada se očiste 5 `any`, plafon se spušta na 54, itd.

---

## 7. Testovi

Novi: `src/test/backup-schema.test.ts`
- ✅ validni v6 backup parsa bez greške
- ✅ legacy v3 backup (sa nepostojećim poljima) parsa kroz `.passthrough()`
- ✅ malformed `cards[0].sections = "not array"` → `safeParse` vraća error
- ✅ `frequencyTag: "INVALID"` → strip-ovano, ne baca error (`.optional()`)
- ✅ `examinerProfile.notes: "<script>alert(1)</script>"` → sanitizovano kroz `.transform`
- ✅ `mindMaps[0].nodes[0].data.label: "<img onerror=...>"` → sanitizovano
- ✅ prazan backup `{ cards: [], categories: [] }` → defaults popunjeni

Postojeći testovi prolaze nepromijenjeno (svi ulazi u `useCardImport` su validni).

---

## Tehnički sažetak za review

| Stavka | Prije | Poslije |
|---|---|---|
| `any` u `useCardImport.ts` | 6 | 0 |
| `any` u `useCardExport.ts` | 2 | 0 |
| LOC `useCardImport.ts` | 486 | ~280 |
| Validacija backup payload | ručne `typeof` provjere, 4 helper fn-a | 1 `BackupSchema.safeParse` |
| XSS sanitizacija HTML polja | razbacana po `useCardImport` | centralizovana u Zod `.transform()` |
| ESLint `no-explicit-any` | nije konfigurisano | scoped `error` + global `warn` + ratchet plafon |
| Bundle size delta | — | +~12KB gz (zod) |

## Ne ulazi u scope

- Migracija ostalih ~50 `any` u workerima/testovima/ErrorBoundary-ju (ratchet pattern će ih izbacivati postepeno)
- Refaktor `SmartSplitSummaryDialog` (574 LOC) — odvojen audit nalaz
- Log retention policy za `reviewLog` — odvojen audit nalaz

Po odobrenju, primjenjujem izmjene i runam `bun run test` + `bun run lint` da potvrdim 0 grešaka u kritičnim putanjama.
