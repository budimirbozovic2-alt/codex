# Universal Smart-Split Wizard for All Sources

## Cilj

Trenutno se `SmartSplitSummaryDialog` (sa preview-om cijele kartice) otvara samo kad selektovani tekst sadrži "Član X" markere. Za sve ostale slučajeve (skripte, esejski pasusi bez članova) koristi se stari `EssayCreationDialog` koji **nema preview**.

Cilj: **uvijek** otvoriti SmartSplit wizard, čak i kad ima samo 1 modul (cijela selekcija = 1 kartica), tako da preview funkcioniše univerzalno.

## Pristup

Modifikovati `handleConvertToEssay` u `src/hooks/useSourceReaderActions.ts` da:
1. Ako `splitSelection` nađe članove → zadržati postojeće ponašanje (više modula).
2. Ako NE nađe članove → **sintetizovati 1 `SelectionModule`** iz cijele selekcije i otvoriti wizard sa N=1.

Wizard već ispravno radi sa N=1: lista modula je single item, prev/next dugmad se same disabluju na granicama, a `splitMode: "separate"` proizvodi tačno 1 karticu (bez pseudo-roditelja).

## Implementacija

### 1. `src/hooks/useSourceReaderActions.ts` — `handleConvertToEssay` (linije 72–95)

Zamijeniti `else` granu (koja otvara `EssayCreationDialog`) logikom koja gradi single-module split result:

```ts
if (result.hasArticles && result.modules.length > 0) {
  setSplitResult(result);
  initSplitWizard([...result.modules], result.parentName);
  setSplitMode("separate"); // default za multi-modul
  setSplitSummaryOpen(true);
} else {
  // Bez članova: kreiraj 1 sintetički modul iz cijele selekcije
  const plainSnippet = text.trim();
  const contentHtml = sanitizeHtml(html || `<p>${text}</p>`);
  const fallbackTitle = firstWords(plainSnippet, 7) || "Esej iz izvora";
  const singleModule: SelectionModule = {
    articleNum: "",
    title: fallbackTitle,
    contentText: plainSnippet,
    contentHtml,
    plainSnippet,
  };
  const synthResult: SelectionSplitResult = {
    hasArticles: false, // ostaje false — koristi se kao signal za wizard UI
    modules: [singleModule],
    rangeLabel: fallbackTitle,
    parentName: fallbackTitle,
  };
  setSplitResult(synthResult);
  initSplitWizard([singleModule], fallbackTitle);
  setSplitMode("separate"); // 1 modul → 1 kartica
  setSplitSummaryOpen(true);
}
```

Eksport `firstWords` helpera iz `selection-split-engine.ts` (trenutno je private) ili duplirati 5-line helper inline u hook.

### 2. `src/components/source-reader/SmartSplitSummaryDialog.tsx` — kozmetičko prilagođavanje za N=1

Provjeriti par mjesta gdje wizard pretpostavlja više modula:
- Tab toggler "Separate / Combined" treba biti **sakriven** kad `total === 1` (combined nema smisla za 1 modul).
- Lista modula u lijevom rail-u: ako `total === 1`, sakriti rail i dati cijeli prostor question + preview-u.
- Naslov dijaloga: ako nema članova (`!splitResult.hasArticles`), prikazati "Kreiranje eseja" umjesto "Smart Split".

### 3. `EssayCreationDialog` — zadržati ili ukloniti?

`EssayCreationDialog` postaje mrtav kod (poziva ga samo `handleCreateEssay`, koji više nije reachable). Opcije:
- **A:** Ostaviti kao fallback i jednostavno više ne mountovati u `SourceReader.tsx`.
- **B:** Obrisati fajl + import iz `SourceReader.tsx` + obrisati `handleCreateEssay` iz hook-a + obrisati `essayDialogOpen / essayQuestion / setEssayDialogOpen / setEssayQuestion` iz Zustand store-a.

Preporuka: **opcija B** — čisto brisanje (eliminiše mrtav kod, ujednačava tok). Keyboard shortcut na liniji 440 (`if (s.essayDialogOpen) s.setEssayDialogOpen(false);`) treba zamijeniti sa `if (s.splitSummaryOpen) s.setSplitSummaryOpen(false);` (Esc za zatvaranje).

### 4. Verifikacija

- Ručno: selektovati pasus iz **skripte** (bez "Član X") → wizard se otvara, sa 1 modulom, preview gumb radi, kreira 1 karticu.
- Ručno: selektovati raspon iz **zakona** sa više članova → wizard radi kao i prije (N modula, separate/combined).
- Test suite: `bunx vitest run` — provjeriti `src/test/split-wizard-build.test.ts` i `selection-split.test.ts`.

## Izmijenjeni fajlovi

- `src/hooks/useSourceReaderActions.ts` — restrukturisan `handleConvertToEssay` + uklonjen `handleCreateEssay`
- `src/components/source-reader/SmartSplitSummaryDialog.tsx` — sakrivanje toggler-a + rail-a kad je `total === 1`, dinamički naslov
- `src/components/SourceReader.tsx` — uklonjen `<EssayCreationDialog>` mount
- `src/store/useSourceReaderStore.ts` — uklonjena 4 polja (`essayDialogOpen`, `essayQuestion`, setter-i)
- `src/lib/selection-split-engine.ts` — eksportovati `firstWords` helper
- `src/components/source-reader/EssayCreationDialog.tsx` — **obrisan**
- `mem://features/smart-split-wizard` — ažurirati napomenu da wizard radi za sve selekcije (ne samo članove)

## Pitanja prije implementacije

Idem li sa **opcijom B** (čisto brisanje `EssayCreationDialog`) ili **opcijom A** (ostavi fajl, samo ne mountuj)? B je čistije ali mijenja više fajlova.
