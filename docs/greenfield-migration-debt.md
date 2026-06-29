# Tehnički dug — greenfield migracija

Datum: 2026-06-23  
Kontekst: Strangler fig refaktor prema [`greenfield-migration-plan.md`](greenfield-migration-plan.md).  
Ovaj dokument prati **novi** tehnički dug koji nastane **kao posljedica** migracije (ne naslijeđeni TD-ARCH/TD backlog).

Procjena: **Fibonacci SP** (1, 2, 3, 5, 8, 13). Rizik: nizak / srednji / visok.

---

## Kako koristiti

1. Svaki novi kompromis tokom Wave 1–5 dobija ID `GF-DEBT-N`.
2. Pri zatvaranju tikaeta: status → ✅ Done + datum + kratka napomena šta je urađeno.
3. Namjerno odgođene stavke iz plana **ne** idu ovdje — ostaju u planu kao 🔲.

---

## Aktivni dug

### GF-DEBT-0 · Test DOM shim + factories heuristika (Wave 0)

| | |
|---|---|
| **Wave** | 0 |
| **Prioritet** | P2 |
| **SP** | 3 |
| **Rizik** | nizak |
| **Status** | ⏳ Otvoren |

**Problem:** Node 24+ izlaže djelimičan `window`; Vitest `environmentMatchGlobs` ne postavlja pouzdano `VITEST_ENVIRONMENT=jsdom`. Testovi koji koriste `makeSource({ html: "…<p>…</p>…" })` padaju ako factory koristi `minimalDocFromHtml` (gubi strukturu paragrafa).

**Implementirano (Wave 0 workaround):**
- `src/test/setup-dom.ts` — JSDOM shim prije ostalih setup modula
- `src/test/install-node-dom-shim.ts` — pun DOM (NodeFilter, TreeWalker, TipTap)
- `src/test/setup.ts` — DOMPurify mock (hoisted, ESM-safe)
- `src/test/factories.ts` — `htmlNeedsRealCodec()` heuristika za block-level HTML

**Dug koji ostaje:**
- Heuristika `/<\/?(p|div|…)/` nije formalna garancija — edge case HTML može pogrešno ići na stub
- `setup-dom.ts` duplicira odgovornost sa Vitest jsdom env za neke fajlove
- `vitest.config.ts` još koristi deprecated `environmentMatchGlobs` (Vitest 3 preporučuje `test.projects`)

**Predlog zatvaranja (Wave 1 ili 2):**
1. Migrirati na `test.projects`: `{ node: …, jsdom: … }` — eksplicitno okruženje
2. U factories: `makeSource({ contentDoc })` za unit testove bez HTML; `html` opcija samo u jsdom projektu
3. Ukloniti `htmlNeedsRealCodec` heuristiku

**DoD zatvaranja:**
- Nema `htmlNeedsRealCodec` u factories
- `install-node-dom-shim` koristi se samo u node projektu koji stvarno treba DOM
- Svi editor-v4 / source-editing testovi u jsdom projektu

---

## Zatvoreni dug (Wave 0)

### GF-DEBT-0a · DOMPurify ESM mock u Vitestu

| | |
|---|---|
| **Status** | ✅ Zatvoreno (2026-06-23) |

**Problem:** `default.sanitize is not a function` — pogrešan mock format za ESM `dompurify` import.  
**Rješenje:** Hoisted mock sa `{ default: purify, ...purify }` u `setup.ts`.

---

## Predloženi šablon za nove stavke

```markdown
### GF-DEBT-N · Kratak naslov

| | |
|---|---|
| **Wave** | 1–5 |
| **Prioritet** | P1–P4 |
| **SP** | Fibonacci |
| **Rizik** | nizak / srednji / visok |
| **Status** | ⏳ Otvoren |

**Problem:** …
**Uzrok (zašto nastao tokom migracije):** …
**Predlog zatvaranja:** …
**DoD:** …
```

---

## Očekivani dug po talasu (proaktivno)

| Wave | Vjerovatni kompromisi |
|------|------------------------|
| **1** | Privremeni dual invalidation (stari coordinator + novi `invalidateQueries`) dok grep ≠ 0 |
| **2** | Deprecated re-export barreli `hooks/` → `features/` (1–2 sprinta) |
| **3** | `db-gateway.ts` feature flag + paralelni `sqlite-rpc` fallback |
| **3** | DTO tipovi duplirani renderer/main dok nema shared package |
| **4** | Dual-write period — privremeno 2× disk za card updates |
| **4** | `payload` kolona nullable dok traje cutover |
| **5** | Zaboravljeni test mockovi za obrisani `sqlite-rpc` |

Stavke se otvaraju u ovom dokumentu **kad nastanu**, ne unaprijed.
