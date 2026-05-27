# Sesija 1: Re-audit nalaz — nema posla za izvršiti

Detaljnim pretragama izvora utvrđeno je da su sve četiri ciljane stavke (S1 + S2 + A4 + B5) **već implementirane**. Audit dump koji opisuje stanje "treba uraditi" odražava codebase prije nedavnih PR-ova (vjerovatno PR-7d M2.1 / PR-7e M4).

## Šta je provjereno

| # | Cilj | Status u trenutnom kodu | Dokaz |
|---|------|------------------------|-------|
| **S1** | Ukloniti `useDualReadDiff` + `useCardSelectorsFromDb` façade iz `src/store/useCardSelectors.ts` | ✅ Done | Fajl počinje komentarom "Phase 1 + Phase 2 dual-read façade dismantled". Nijedan grep hit u `src/` za `useDualReadDiff` ni `useCardSelectorsFromDb`. Selektori (`useCardsByCategoryRam` itd.) su čisti `useSyncExternalStore` nad `cardMapStore`. |
| **S2** | `EditorSection.CuttingView` mora čitati `section.contentDoc`, ne `section.content` | ✅ Done | `src/components/card-form/EditorSection.tsx:196,240-241` već prosleđuje `section.contentDoc`. Jedini grep hit za `section.content` u cijelom `src/` je komentar u `src/lib/auto-link-suggestion.ts:68` koji objašnjava zašto se NE čita. |
| **A4** | Ukloniti `Section.content?: string` iz tipova | ✅ Done | `src/lib/sr/types.ts:12-29` — `Section` ima samo `contentDoc: EditorDoc` (required). Komentar: "Legacy `content` HTML was removed in PR-7e M4." |
| **B5** | Obrisati `html` prop sa svih `ContentRenderer` (`<n>`) konzumera | ✅ Done | `src/components/ui/ContentRenderer.tsx` već prihvata samo `doc?: EditorDoc \| null`. Svih ~10 call-site-ova (CardViewTable, EditorSection, SourceSnippetDialog, PassiveReader, ZettelPreview, WorkshopCardItem, CuttingView, itd.) već prosleđuje `doc={…contentDoc}`. Nijedan ne prosleđuje `html=`. |

## Dodatne sondaže (radi sigurnosti)

- `useLiveQuery` u UI-u: jedini hit je komentar u `useLinkedCards.ts` ("keeps the dialog free of `useLiveQuery` re-renders") — pravilo poštovano.
- Runtime `@/lib/db` u UI/hooks: svi UI hitovi su `import type` (ESLint pravilo iz prethodne sesije važi). Runtime importi ostali samo u storage sloju (`mnemonic-storage/*`) i 2 dynamic importa (`useCardExport`, `DatabaseRecoveryPanel`) koji su izvan UI render-patha.

## Posljedica

- Net LOC delta = **0** (nema šta da se obriše).
- "Tihi v22 crash" više nije reachable jer A4 + S2 garantuju da nijedan read-path ne dira nepostojeći `section.content`.
- TanStack rollout (Sesija 2 / S3) je već otključan — nema više dual-read patha koji bi ga blokirao.

## Preporuka

Preskočiti Sesiju 1 i prijeći direktno na **Sesiju 2 — S3: migracija read-patha (planner / examiner / drafts) iz Dexie u SQLite + TanStack**. To je najveći LOC bonus (~-1500), otključava A1 (drop IDB outbox), A2 (collapse categoryDeletionService) i B1 (drop dexie dep).

## Akcioni koraci (ako odobriš ovaj nalaz)

1. Ažurirati `mem://index.md` Core sekciju ili dodati kratku napomenu da je v22 contentDoc cutover potvrđen kao zatvoren (jedan red).
2. Označiti S1/S2/A4/B5 kao DONE u eksternom auditu (offline za korisnika).
3. Otvoriti novi planni zahtjev za S3 (Sesija 2) — to je samostalna velika promjena i tražim novu rundu eksploracije prije nego što napišem plan.

**Ništa od ovoga ne mijenja kod**; ako želiš da ja samo ažuriram memory napomenu, reci pa ću to uraditi u build modu.
