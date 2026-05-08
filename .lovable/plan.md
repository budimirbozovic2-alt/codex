## Cilj

Razbiti `src/hooks/useCardActions.ts` (369 LOC, 16 `useState` poziva, B−) na tri fokusirana sub-hook-a + tanki orkestrator. **Bez API breaking change-a** — `useCardActions` zadržava identičan return shape, tako da `CardForm.tsx` i `EditPage.tsx` ostaju netaknuti.

## Nova struktura

```text
src/hooks/card-actions/
  useSectionEditor.ts     // cardType, question, flashAnswer, sections, cuttingIndex + section actions
  useCardMetadata.ts      // categoryId/subcategoryId/chapterId + new* + show* + frequencyTag/sourceType
                          //   + availableSubs, availableChapters, resolvedMeta, linkedGazetteInfo
  useCardDraft.ts         // pendingDraft banner + restore/dismiss + draftKey + autosave wiring
  validation.ts           // validate(), ValidationErrors, parseHtmlToParagraphs (čista util logika)
src/hooks/useCardActions.ts  // orchestrator (~80 LOC): kompozicija + handleSubmit + return objekt
```

## Detalji po modulu

**`useSectionEditor`**
- State: `cardType`, `question`, `flashAnswer`, `sections`, `cuttingIndex`, `validationErrors`, `isSaving`.
- Actions: `addSection`, `removeSection`, `updateSection`, `moveSection`, `handleCut`.
- Init iz `editCard` (essay/flash grananje kao danas).
- Vraća sve setere + akcije + read-only state.

**`useCardMetadata`**
- State: `categoryId`, `subcategoryId`, `chapterId`, `newCategory`, `showNewCat`, `newSubcategory`, `showNewSub`, `newChapter`, `showNewChapter`, `frequencyTag`, `sourceType`, `formWidth`, `linkedGazetteInfo`.
- Derived: `availableSubs`, `availableChapters`, `resolvedMeta` (sve postojeće `useMemo` netaknute).
- Effect: load `linkedGazetteInfo` iz `db.sources` kad postoji `editCard.sourceId`.
- Init iz `editCard` + `categories[0]` fallback.

**`useCardDraft`**
- Computa `draftKey` preko `buildDraftKey` (initialCategoryIdRef pattern zadržan).
- Drži `pendingDraft`, `pendingDraftSavedAt`; one-shot `loadCardDraft` na mount.
- `autosaveEnabled = pendingDraft === null`; poziva `useCardDraftAutosave(draftKey, snapshot, enabled)`.
- Prima `draftSnapshot` kao argument (orkestrator ga sastavi iz drugih hookova).
- Prima `applyDraft(draft)` callback koji editor + metadata hooks izlažu da bi `restoreDraft` mogao popuniti njihovo state.
- Vraća: `pendingDraft`, `pendingDraftSavedAt`, `restoreDraft`, `dismissDraft`, `clearDraft`.

**`validation.ts`**
- Premjestiti čiste funkcije: `validate`, `parseHtmlToParagraphs`, tip `ValidationErrors`.
- Re-eksport iz `useCardActions.ts` radi backwards compat (tipovi `SectionInput`, `CardType`, `FormWidth`, `ValidationErrors`).

**`useCardActions` (orkestrator)**
- Pozove `useSectionEditor`, `useCardMetadata`, pa `useCardDraft` (kome proslijedi snapshot + apply callback).
- Drži samo `handleSubmit` (validacija → `onUpdate`/`onSave`/`onSaveFlash` → `clearDraft` → setIsSaving).
- Vrati spread svih sub-hookova + handleSubmit, identičan oblik kao danas.

## Tipovi i back-compat

- `SectionInput`, `CardType`, `FormWidth` ostaju eksportovani iz `useCardActions.ts` (re-export).
- Return shape neporomijenjen → `CardForm.tsx` koristi sve property-je nepromijenjeno.
- `useCardDraftAutosave` API ostaje isti.

## Verifikacija

- `bunx vitest run src/test/card-draft-autosave.test.ts` — postojeći test mora proći.
- TypeScript build (auto).
- Smoke: open `/new`, otkucaj → reload → "Vrati nacrt" radi; edit existing card → save → no orphan draft.

## Procjena gradea

Cilj: B− → A−. Svaki sub-hook < 120 LOC, jasna SRP, orkestrator ~80 LOC bez state šuma.
