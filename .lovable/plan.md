
# PR-7d M2 + M3 — Performance, Write API, Cache Cleanup

Nastavak PR-7d. M1 (P0 crash + dual-read demontaža) je gotov. Sada slijede performance regresije iz audit-a i priprema cache površine za TanStack/OPFS migraciju.

---

## Milestone 2 — P1: Perf + Write API

### M2.1 `AstNodeRenderer` + AST-only `ContentRenderer`

**Problem:** trenutni `ContentRenderer` per-row spawn-uje cijeli TipTap `EditorView` instance (ProseMirror schema, plugins, transactions). U virtualizovanim listama (`CardViewTable`) to je 10–50× skuplje od prethodnog `SafeHtml` pristupa.

**Rješenje:** pure React walker koji emituje JSX direktno iz AST node-ova — bez TipTap-a, bez DOM mutationa.

Koraci:
1. Kreirati `src/components/ui/AstNodeRenderer.tsx`:
   - Prima `doc: EditorDoc`, mapuje `content.content[]` rekurzivno.
   - Pokriti node tipove: `paragraph`, `heading` (level 1–3), `bulletList`/`orderedList`/`listItem`, `blockquote`, `codeBlock`, `hardBreak`, `text`.
   - Mark tipovi: `bold`, `italic`, `underline`, `code`, `keyPart` (klasa za highlight), `link` (`<a target="_blank" rel="noopener">`), `wikiLink` (interni handler).
   - Mindmap embed (`::mindmap[id]`) → placeholder div sa data-attrom; klik handler dolazi iz parent context-a (prop callback).
   - Snapshot test sa fixturama iz `src/test/fixtures/editor-html/*` da AST → JSX pokriva sve postojeće node tipove.

2. Refactor `ContentRenderer.tsx`:
   - Ukloniti `html` prop u potpunosti.
   - Internal: ako `doc?.version === 4` → `<AstNodeRenderer>`; inače prazan render.
   - `EditorView` (TipTap read-only) **ostaje** samo za bogate kontekste gdje treba klik na interne node-ove (Zettelkasten article body) — eksplicitno preko `<EditorView>` importa, ne preko `ContentRenderer`-a.

3. Migrirati read-only call-site-ove na novi `ContentRenderer` (sa samo `doc` propom):
   - `src/components/category/CardViewTable.tsx` — najveći perf win (virtualizovan).
   - `src/components/learn/StudyModeRecall.tsx` (reveal/read faza).
   - `src/components/SourceSnippetDialog.tsx`.
   - `src/components/source-reader/smart-split/CuttingView.tsx` blokovi.
   - `src/components/card-form/EditorSection.tsx` preview.
   - `src/components/LinkToExistingCardModal.tsx`.
   - `src/components/subject-cards/PassiveReader.tsx`.
   - `src/components/zettelkasten/SourceSidePanel.tsx`.
   - `src/components/zettelkasten/ZettelPreview.tsx` (provjeriti da li traži klik na wikilink — ako da, ostaje `EditorView`).

### M2.2 Eliminisati `RichTextEditorV4` shim

Trenutno 3 konzumera koriste shim koji wrap-uje `EditorV4` i emituje HTML (kontradikcija sa AST-as-SSOT politikom):

- `src/components/source-reader/smart-split/ModuleCard.tsx`
- `src/components/source-reader/SmartSplitSummaryDialog.tsx`
- `src/features/mnemonic/workshop/WorkshopCardItem.tsx`

Akcije:
1. U svakom konzumeru zamijeniti local state `htmlContent: string` sa `contentDoc: EditorDoc`.
2. `onChange(html)` → `onChange(doc)`.
3. Parent store/types update:
   - Smart-split module tip (gdje god `htmlContent` živi u smart-split state-u) → `contentDoc: EditorDoc`.
   - Mnemonic workshop card item draft → `contentDoc`.
4. Eksport boundary (smart-split → kartica koja ide u `cardRepository.put`) je već AST-native poslije PR-7b, pa nema dodatnog kombera.
5. **Lazy migration** u storage learn layeru: ako load naiđe na stari `htmlContent` string u localStorage draft-u, konvertovati preko `htmlToDoc` pri load-u i odmah re-save-ovati.
6. Obrisati `src/components/editor-v4/RichTextEditorV4.tsx`.

### M2.3 Fix `EditorV4` placeholder churn

`src/components/editor-v4/EditorV4.tsx:177-182` — `placeholder` je u `extensions` memo dependency listi, pa svaka promjena placeholder stringa re-instancira cijeli ProseMirror editor (gubi se selection, scroll, history).

Fix:
- `useLatestRef(placeholder)` pattern.
- `Placeholder.configure({ placeholder: () => latestPlaceholderRef.current })`.
- Skinuti `placeholder` iz extensions memo deps; editor se i dalje uništava u unmount cleanup-u, ali ne na placeholder change.

### M2.4 Standardizacija write API shape

Pripremno za TanStack `useMutation` — sve write funkcije moraju vratiti uniformni rezultat tip:

```ts
type WriteResult<T = void> = { ok: true; value: T } | { ok: false; error: WriteError };
```

Targets:
- `cardRepository.put` / `bulkPut` → async, vraća `WriteResult<Card>` / `WriteResult<Card[]>`.
- `saveSource`, `saveArticle` → ujednačiti return shape (već async).
- `categoryRepository.commit` — već usklađen, samo verifikovati shape.

Caller-i koji ne čitaju return value → no-op. Caller-i koji baca/await — refactor na `if (!res.ok) { ... }`.

---

## Milestone 3 — P2: Cache površina

### M3.1 Deduplicirati cards keševe

Trenutno tri konkurentska keša za istu kartice kolekciju:
- `_mapVersion`/`_cachedArray` u `src/lib/persist-queue.ts:21-30`.
- `_cardsCacheMap`/`_cardsCacheArr` u `src/contexts/cards/CardStateProvider.tsx:28-37`.
- `cardMapStore` (Zustand) — pravi SSOT.

Akcije:
1. Ukloniti `_mapVersion`/`_cachedArray` + `bumpMapVersion()` poziv iz `persist-queue.ts`.
2. Ukloniti `_cardsCacheMap`/`_cardsCacheArr` iz `CardStateProvider.tsx`.
3. Dodati `useCardsArray()` selector iznad `cardMapStore` koji koristi `useShallow` ili `useMemo` referenciranjem na map verziju.
4. Svi konzumeri `Object.values(cardMap)` → `useCardsArray()`.

### M3.2 `PersistAdapter` interface

Izvući IDB-specific write logiku iza interface-a, BEZ promjene ponašanja (priprema za OPFS SQLite adapter u zasebnom PR-u):

1. Kreirati `src/lib/persistence/PersistAdapter.ts`:
   ```ts
   export interface PersistAdapter {
     bulkApply(ops: PersistAction[]): Promise<void>;
     recoverPending(): Promise<PersistAction[]>;
   }
   ```
2. Kreirati `src/lib/persistence/idb-outbox-adapter.ts` — trenutna implementacija (`outboxPut` → `put` → `outbox.bulkDelete`) preseljena iza interface-a.
3. `persist-queue.ts` instancira jedan adapter (DI-friendly factory za test override) i poziva ga umjesto direktnog Dexie poziva.
4. OPFS adapter dolazi u zasebnom PR-u; ovaj korak samo otvara šav.

---

## Milestone 4 — Verifikacija

- `bunx tsc --noEmit` — clean.
- `bunx vitest run` — svi prolaze. Posebno:
  - `AstNodeRenderer` snapshot suite (novi).
  - Postojeći `editor-view-readonly.test.tsx` — adaptirati na `ContentRenderer` bez `html` propa.
- Manual smoke (preview):
  - `CardViewTable` virtualizovan scroll na velikoj kategoriji — vidljiv pad u CPU profile-u.
  - Smart-Split (Cutting + Summary) — drag, edit, save.
  - Mnemonic workshop — edit card item, save.
  - Study Mode reveal.
  - Zettelkasten preview (klik na wikilink i dalje radi — `EditorView` ostaje).

---

## Eksplicitno izvan scope-a

- **P3**: zettelkasten cache, event-bus redukcija — kozmetika.
- **DIO D**: OPFS SQLite migracija, FK CASCADE, backlink denorm tabela, test adapter, `outbox` brisanje — zaseban PR (PersistAdapter iz M3.2 je samo šav).
- Bilo kakva promjena v22 destrukcijskog gate-a (`v4_telemetry_healthy`).

---

## Procjena rizika

| Milestone | Rizik | Mitigacija |
|---|---|---|
| M2.1 | `AstNodeRenderer` može propustiti rijetki node tip → prazan render | Snapshot test sa fixture set-om; fallback `<span data-unknown={type}/>` u dev modu sa `logger.warn` |
| M2.2 | Stari smart-split/mnemonic draftovi u localStorage imaju `htmlContent` string | Lazy `htmlToDoc` migracija u load path-u storage-a |
| M2.3 | `useLatestRef` pattern može maskirati zaista željen reset | Verifikovati da svi caller-i koji žele reset koriste `key={...}` na `EditorV4` |
| M2.4 | Promjena return shape-a `cardRepository.put` | Grep-and-replace; većina caller-a ignoriše povratnu vrijednost |
| M3.1 | Uklanjanje keša može uvesti O(n) regresiju ako `Object.values` curi u render path | `useCardsArray()` koristi referencijalnu stabilnost preko verziong-a u `cardMapStore` |
| M3.2 | Pogrešna apstrakcija → suvišan refactor kad dođe OPFS | Adapter interface namjerno minimalan (`bulkApply` + `recoverPending`); ostalo u sljedećem PR-u |
