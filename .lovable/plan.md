## Problem

Trenutno wizard za kreaciju eseja iz izvora ima dvije rupe:

1. **Nema ručnog sječenja modula.** Kad selekcija ne sadrži "Član X" markere, sintetiše se samo **jedan** modul i nema dugmeta da se taj modul ručno podijeli na više cjelina (ili da se doda novi modul). Auto-detekcija radi samo za pravne članove.
2. **Nema izbora potkategorije i glave.** `handleSmartSplitConfirm` poziva `addCard(question, sections, source.categoryId, undefined, undefined, ...)` — drugi i treći `undefined` su `subcategoryId` i `chapterId`. Iako `addCard` i `Card` shema oboje podržavaju (`db-schema.ts` ima `SubcategoryNode.chapters: ChapterNode[]`), wizard ih nikad ne postavlja, pa kartice završe direktno na korijenu predmeta.

Korisnik želi da, prije importa, može:
- Dodati nove module ručno (i obrisati postojeće), uključujući slučaj kad nema članova.
- Dodijeliti potkategoriju i glavu (opciono) za sve kartice koje će nastati.

## Rješenje

### 1. Ručno upravljanje modulima u wizardu

U `SmartSplitSummaryDialog.tsx`, u lijevoj koloni (rail) dodati:
- **"+ Dodaj modul"** dugme na dnu liste — kreira novi `SelectionModule` sa praznim `articleNum`, naslovom "Novi modul", praznim `contentHtml/contentText/plainSnippet` i seedom `defaultEdit`. Push u `splitModules` + `splitEdits`, skoči na novi step.
- **"Obriši modul"** ikonica pored svakog modula (kad `total > 1`) — uklanja modul iz oba arraya, ažurira `splitStepIndex` ako je obrisani bio aktivan.
- **"Podijeli modul"** akcija u editoru desno — otvara mali popover gdje korisnik zalijepi/izabere graničnik (npr. prazan red, "---", ili regex `/Član \d+/`) i automatski razdvaja trenutni modul. Implementirano kao pure helper `splitModuleByDelimiter(mod, delim)` u `selection-split-engine.ts` koji vraća `SelectionModule[]`.

Posljedica: rail se uvijek prikazuje čim `total > 1`, čak i u "synthetic single" flow-u. Ako korisnik klikne "+ Dodaj modul" iz početnog jednog sintetičkog, automatski izlazi iz `isSyntheticSingle` UI-ja i prelazi u puni wizard sa toggleom separate/combined.

Editor desno dobija novo polje **"Sadržaj modula"** (`textarea` ili mali RTE) koje pokazuje/uređuje `currentModule.contentHtml`. Trenutno wizard pokazuje samo question + tagove; sadržaj je read-only iz selekcije. Sa ručnim modulima sadržaj mora biti editabilan. Update upisuje sanitizovani HTML kroz novi `updateModule(i, patch)` helper koji mutira `splitModules`.

### 2. Izbor potkategorije i glave

Iznad mode-toggle reda u dialogu, dodati novu traku **"Lokacija u predmetu"** sa dva `Select` komponenta (postojeći `@/components/ui/select`):

- **Potkategorija** — opcije = `categoryRecord.subcategories` filtrirano po `source.categoryId` + opcija "(direktno u predmet)".
- **Glava** — opcije = `selectedSubcategory?.chapters` + opcija "(bez glave)". Disabled kad nema izabrane potkategorije.

Wizard čita `categoryRecords` iz `useCategoryData()` i lokalno čuva izbore `wizardSubcategoryId` i `wizardChapterId` u Zustand storeu (dva nova polja + settera, defaultuju se na `""`). Dodjela vrijedi za **sve** kartice koje će biti kreirane (separate i combined mode jednako).

`handleSmartSplitConfirm` u `useSourceReaderActions.ts` mijenja sve `addCard(...)` pozive da prosljeđuju ova dva polja:
```ts
addCard(question, sections, category, wizardSubcategoryId || undefined, wizardChapterId || undefined, extra)
```

Pri reset wizarda (`reset()` u storeu, `initSplitWizard`, i u `handleConvertToEssay`) ova dva polja se vraćaju na `""`.

Validacija: ako je izabrana glava ali ne i potkategorija — auto-clear glave (UX guard). Ako je potkategorija promijenjena — clear glave.

### 3. Sitnice

- Iz `splitMode` defaulta u `handleConvertToEssay` ostaje `"separate"` za sve flow-ove. Kad korisnik ručno doda module iz sintetičkog single-a, on i dalje vidi separate kao default ali sad mu se otkriva mode-toggle (jer `total > 1`).
- Dodati `splitModuleByDelimiter` test u `src/test/split-wizard-build.test.ts` (ili novi fajl `selection-split-manual.test.ts`).
- Dodati setter `setSplitModules` već postoji — koristimo postojeći.

## Izmjene fajlova

| Fajl | Promjena |
|---|---|
| `src/store/useSourceReaderStore.ts` | + polja `wizardSubcategoryId`, `wizardChapterId` + setteri; reset u `initSplitWizard` i `reset` |
| `src/lib/selection-split-engine.ts` | + pure helper `splitModuleByDelimiter(mod, delim)`; + `createEmptyModule(title?)` factory |
| `src/components/source-reader/SmartSplitSummaryDialog.tsx` | UI: traka za potkategoriju+glavu; "+ Dodaj modul" i "Obriši" u rail-u; "Podijeli modul" popover; editabilan `contentHtml` u editoru; rail vidljiv čim `total > 1` |
| `src/hooks/useSourceReaderActions.ts` | `handleSmartSplitConfirm` čita `wizardSubcategoryId/wizardChapterId` iz storea i prosljeđuje u `addCard`; reset polja u `handleConvertToEssay` |
| `src/test/selection-split.test.ts` (ili novi fajl) | Testovi za `splitModuleByDelimiter` (split po praznoj liniji, po regexu, po custom string-u) i `createEmptyModule` |

## Out-of-scope

- Per-modul (umjesto per-wizard) izbor potkategorije/glave — wizard koristi jednu lokaciju za sve kartice. Ako kasnije zatreba per-modul, dodaje se override u `WizardModuleEdit`.
- Kreacija nove potkategorije/glave iz wizarda — to ostaje u `Settings → Predmeti`. Wizard samo bira postojeće.
- Drag-and-drop reorder modula u rail-u (može u sljedećoj iteraciji).
