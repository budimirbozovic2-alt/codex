## PR-7e — Eliminate dual-read drift & legacy HTML editor seams

Cilj: ukloniti tehnički dug identificiran u `audit-post-pr7d-architecture-grade.md` (P1) — fasada s dvostrukim čitanjem, legacy RTE shim, HTML-only `CuttingView`, te `Section.content` koji blokira TS-driven čišćenje.

---

### M1 — Demontaža `useDualReadDiff` + `useCardSelectorsFromDb` (RAM SSOT) — ~−400 LOC

**Odluka:** `cardMapStore` ostaje jedini izvor istine za selektore. Dexie `liveQuery` put se gasi.

- `src/store/useCardSelectors.ts`
  - Ukloniti `useDualReadDiff`, `logDivergenceOnce`, `_loggedDivergence`, `USE_DB` snapshot, sve `*FromDb` importe i import `logger`-a.
  - `useCardsByCategory/Subcategory/Chapter/CountByCategory/ById` ostaju jednostavni re-export `…Ram` varijanti pod javnim imenom.
- Obrisati `src/store/useCardSelectorsFromDb.ts` u cijelosti.
- `src/store/index.ts`: ukloniti re-export bloka iz `./useCardSelectorsFromDb` i ažurirati komentar koji spominje `USE_DB_LIVE_SELECTORS`.
- `src/lib/feature-flags.ts`: ukloniti `USE_DB_LIVE_SELECTORS` ključ iz `FeatureFlagKey` i registra; ako je to jedini flag, sažeti `FeatureFlagKey` na `never`-safe oblik (zadržati API).
- `src/test/feature-flags.test.ts`: prepisati testove tako da koriste mock flag ključ (ili obrisati testove vezane za uklonjeni flag i zadržati registar-test sa stub ključem).
- `src/test/perf/cards-query-bench.test.ts`: zadržati bench, ali ukloniti spomen `USE_DB_LIVE_SELECTORS` iz komentara.
- `useCardsBySource` (granular selector) ostaje netaknut — nije dio facade-a.

Napomena: `cardsByCategory/Subcategory/Chapter/Source/cardCountByCategory` u `src/lib/db/queries/cards.ts` ostaju (i dalje koristi `useCardsBySource` i bootstrap loaders) — samo se React-hook sloj iznad njih briše.

---

### M2 — Eliminacija `RichTextEditorV4` shim-a (3 konzumera) — ~−150 LOC

Sva tri preostala mjesta migriraju na `<EditorV4>` + `EditorDoc` kao izvor istine; HTML se izvodi tek kada se piše u storage (`deriveHtml(doc)`).

Konzumeri:
1. `src/components/source-reader/smart-split/ModuleCard.tsx` — dva `RichTextEditorV4` (title minimal, content full).
2. `src/components/source-reader/SmartSplitSummaryDialog.tsx` — jedan editor (linija 133).
3. `src/features/mnemonic/workshop/WorkshopCardItem.tsx` — `lazy` import (linija 23, korištenje 147).

Plan po konzumeru:
- Lokalni `useMemo` za `initialDoc = htmlToDoc(value)` pri mountu (kao u trenutnom shimu).
- `onChange={(doc) => onChange(deriveHtml(doc))}` na callsite — minimalni delta jer parent state ostaje HTML string (smart-split / mnemonic storage još uvijek perzistira HTML; konverziju na `contentDoc` perzistenciju radimo u zasebnom PR-u).
- `WorkshopCardItem`: `lazy(() => import("@/components/editor-v4/EditorV4"))` zadržati lazy boundary.
- Obrisati `src/components/editor-v4/RichTextEditorV4.tsx`.

Rezultat: nema više `htmlToDoc`/`docToHtml` round-tripa per-keystroke — konverzija samo na seed i na commit prema parentu, identično kao u ostatku V4 stacka.

---

### M3 — `EditorSection.CuttingView` na `contentDoc` (bug-fix za v22) — ~+50 LOC

Trenutno `CuttingView` u `src/components/card-form/EditorSection.tsx` prima `content: string` (HTML) i koristi `parseHtmlToParagraphs`. Nakon v22 destruktivne migracije, kanonski izvor je `section.contentDoc`, pa pucaju paragraph-cutovi kad section nema svjež HTML mirror.

- Dodati novu utility `splitDocByTopLevelBlocks(doc: EditorDoc): EditorDoc[]` u `src/lib/editor-v4/` (čisti AST split na top-level `content` nizu doc-a — paragraph/heading/list svaki postaju vlastiti doc).
- `CuttingView` props → `{ doc: EditorDoc; onCut; onCancel }`. Renderirati svaki blok preko `<AstNodeRenderer doc={block}/>`.
- `EditorSection` callsite: proslijediti `section.contentDoc ?? htmlToDoc(section.content ?? "")`.
- `handleCut` u `useSectionEditor` (vidi M4): preraditi tako da rezanje radi nad doc nizom i emitira dva `EditorDoc`-a (umjesto HTML stringova).
- Test: dodati unit test za `splitDocByTopLevelBlocks` (5 slučajeva: 0/1/n paragraphs, mixed heading+list, mindmap embed se ne smije presjeći).

---

### M4 — Skidanje `Section.content?` iz tipa + TS-driven cleanup

- `src/lib/sr/types.ts`: ukloniti `content?: string` polje iz `Section`. `contentDoc` postaje obavezno polje (`EditorDoc`).
- Pratiti `tsc --noEmit` greške i prepravljati read-site-ove:
  - `src/hooks/useCardCRUD.ts` — `createSection(s.title, s.content, s.contentDoc)` → `createSection(s.title, s.contentDoc)`; bilo gdje gdje se `content: n` zapisuje u objekt — ukloniti.
  - `src/hooks/card-actions/useSectionEditor.ts` — `s.content ?? ""` → `docToPlainText(s.contentDoc)`; `seedDoc(s.content, s.contentDoc)` → `s.contentDoc`; `section.content ?? deriveHtml(section.contentDoc)` → `deriveHtml(section.contentDoc)`.
  - `src/hooks/card-actions/validation.ts` — drop legacy fallback grane (`fromLegacy`); duljina se računa isključivo iz `docToPlainText(contentDoc)`.
- `createSection` u `src/lib/spaced-repetition` (ili gdje god je definiran) — signatura postaje `(title, contentDoc)`; ako postoji legacy preopterećenje, ukloniti.
- Backup/migration code (`src/scripts/migrate-editor-v4.ts`, restore path) zadržava sposobnost čitanja starog `content` polja iz JSON backup-a, ali interno odmah konvertira u `contentDoc` — TS tip više ne dopušta zadržavanje polja u memoriji.

---

### Verifikacija (poslije svake milestone)

1. `bunx tsc --noEmit` — mora proći bez `any`/error.
2. `bunx vitest run` — ciljani fileovi: `card-selectors.test.tsx`, `feature-flags.test.ts`, `editor-v4-codec.test.ts`, `editor-v4-cards.test.ts`, `split-wizard-build.test.ts`, plus novi `splitDocByTopLevelBlocks` test.
3. Smoke: otvoriti karticu s 3 sekcije → Cutting mode → cut paragraph → save → reopen (provjeriti da `contentDoc` u IDB sadrži 2 sekcije korektno).
4. Smoke: smart-split wizard — uredi modul title i sadržaj, podijeli, save.
5. Smoke: mnemonic workshop card — uredi hint, save.

### Što NIJE u opsegu

- TanStack Query (PR-7f).
- OPFS SQLite adapter (PR-8).
- Migracija smart-split / mnemonic storage modela na `contentDoc` perzistenciju (slijedi nakon što se HTML→Doc kompatibilnost validira u produkciji).

### Očekivani neto efekt

- ~−500 LOC, jedan izvor istine za card selektore, nula HTML↔Doc round-tripa u tipkanju, `Section.content` legacy polje uklonjeno iz domene.
