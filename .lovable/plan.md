## Cilj

Doraditi Esej čarobnjak (`SmartSplitSummaryDialog`) tako da podjela na module funkcioniše **identično** kao u edit modu kartice — odabir makazica i ručna potvrda linije gdje nastaje split. Ukloniti **paralelni preview screen** ("Pregled kartice"), koji deluje zbunjujuće jer dupla sadržaj.

Promjene se rade **isključivo** u jednom fajlu: `src/components/source-reader/SmartSplitSummaryDialog.tsx`. Logika kreiranja eseja, store, taksonomija i ostali ekrani ostaju netaknuti.

---

## Šta se mijenja u UX-u

### 1. Uklanja se "Pregled kartice" panel
Sekcija na dnu desnog pane-a (label `Eye → Pregled kartice` sa naslovom + sanitizovanim HTML pregledom) potpuno se briše. Pitanje i sadržaj se već vide u editorima iznad — preview je redundantan.

### 2. Nova logika "Podijeli modul" — paragraph scissors
Trenutno: dugme `Scissors → Podijeli modul` otvara popover sa tri opcije (po praznom redu / po "Član X" / po custom graničniku) i podjela je automatska.

Novo (po uzoru na `src/components/card-form/EditorSection.tsx` `CuttingView`):

- Pored sadržaja modula stoji toggle dugme sa makazicama (isti stil kao u editoru kartice).
- Klik na makazice **prebacuje sadržajno polje u "cutting view"**: textarea se zamjenjuje read-only listom paragrafa (parsovanih iz `currentModule.contentText` razdvajanjem po praznoj liniji).
- Između svaka dva paragrafa nalazi se horizontalna linija sa ikonicom makaza (warning boja, isti vizuelni jezik kao postojeći `CuttingView`).
- Klik na linije = ručna potvrda mjesta split-a:
  - Tekst **prije** klika ostaje u trenutnom modulu (zadržava postojeći `title` i `question`).
  - Prvi paragraf **poslije** klika postaje **naslov novog modula** (tačno kao `handleCut` u `useCardActions.ts:269`: `paragraphs[paragraphIndex]` → `newTitle`).
  - Ostatak paragrafa čini sadržaj novog modula.
  - Novi modul se ubacuje odmah ispod trenutnog u splitModules / splitEdits, fokus skače na njega, cutting view se zatvara.
- Ako modul ima ≤1 paragraf, prikazuje se isti hint kao u `CuttingView`: "Nema dovoljno paragrafa za rezanje. Dodajte više teksta."
- Dugme "Otkaži" izlazi iz cutting moda bez promjena.

### 3. Uklanja se popover sa graničnicima
`Popover`, `customDelimiter` state i `performSplit` (sa `splitModuleByDelimiter` pozivom) se uklanjaju iz fajla. Import `splitModuleByDelimiter` ostaje ako se još negdje koristi — provjerom `rg`-om to nije slučaj u ovom fajlu, pa se import skida.

---

## Tehničke izmjene (fajl: `src/components/source-reader/SmartSplitSummaryDialog.tsx`)

1. **Imports**
   - Skinuti: `Popover`, `PopoverContent`, `PopoverTrigger`, `Eye`, `splitModuleByDelimiter`.
   - Zadržati: `Scissors`, `createEmptyModule`, ostatak.

2. **State i logika**
   - Ukloniti: `splitPopoverOpen`, `customDelimiter`, `performSplit`, `previewHtml` memo.
   - Dodati lokalni state: `const [cutting, setCutting] = useState(false);`
   - Reset `setCutting(false)` na promjenu `safeIndex` (useEffect).
   - Dodati helper (lokalno u fajlu) `splitTextByParagraphs(text: string): string[]` — ekvivalent `text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)`. (Ne koristimo `parseHtmlToParagraphs` jer wizard radi na plain-text-u.)
   - Dodati `performManualCut(paraIdx: number)`:
     - Uzme `currentModule.contentText`, podijeli na `parts`.
     - `before = parts.slice(0, paraIdx).join("\n\n")`, `after = parts.slice(paraIdx).join("\n\n")` — pri čemu **prvi** element `parts[paraIdx]` postaje `newTitle` (raw text, trimovan), a `newContentText = parts.slice(paraIdx + 1).join("\n\n")`.
     - `updateModule(safeIndex, { contentText: before, contentHtml: plainTextToHtml(before), plainSnippet: before })`.
     - Ubaciti novi `SelectionModule` na `safeIndex + 1`: `{ title: newTitle, contentText: newContentText, contentHtml: plainTextToHtml(newContentText), plainSnippet: newContentText }` (preko `setSplitModules` splice-om).
     - Dodati pratećih `defaultEdit(newModule)` u `splitEdits` na isti index.
     - `setStepIndex(safeIndex + 1)`, `setCutting(false)`.

3. **JSX — desni pane (modul editor)**
   - `Sadržaj modula` blok: kad `cutting === false`, prikazuje se postojeća textarea + ispod nje umjesto popovera **toggle dugme makaza** (isti stil kao u `EditorSection.tsx:159-170`):
     - klik → `setCutting(true)` (disabled ako modul ima <2 paragrafa ili `currentEdit.skipped`).
   - Kad `cutting === true`, textarea se zamjenjuje **CuttingView** ekvivalentom inline (kopija strukture iz `EditorSection.tsx:24-46`, ali nad plain-text paragrafima):
     ```text
     ┌ Kliknite na makazice da izrežete    [Otkaži] ┐
     │ paragraph 1                                  │
     │ ───── ✂ ─────                                │
     │ paragraph 2                                  │
     │ ───── ✂ ─────                                │
     │ paragraph 3                                  │
     └──────────────────────────────────────────────┘
     ```
     Klik na makaze između para `i` i `i+1` → `performManualCut(i+1)` (paragraf na poziciji `i+1` postaje naslov novog modula — usklađeno sa `handleCut` semantikom).

4. **JSX — uklanja se "Pregled kartice"**
   - Brisati cijeli blok `{/* Live preview */}` (linije ~590-605).

5. **Hint tekst ispod sadržaja**
   - "Prazan red razdvaja paragrafe. Tekst se sanitizuje prije snimanja." ostaje.
   - `Popover` blok pored njega zamjenjuje se gore opisanim toggle dugmetom makaza.

---

## Verifikacija

1. `tsc --noEmit` mora proći (bez `any`, ispoštovati zero-any policy iz core memory).
2. Smoke test (mentalno): otvori source → selektuj tekst → "Konvertuj u esej" → wizard se otvori sa jednim modulom → ukucaj više paragrafa razdvojenih praznim redom → klik na makaze → klik na liniju između paragrafa → trenutni modul ostaje sa tekstom prije, novi modul se kreira, prvi red ispod cut-a postaje njegov naslov, fokus skače na novi modul.
3. Dirty-bar i taksonomijski selektori se ne diraju — preostala ponašanja moraju ostati identična.

---

## Memorija

Po završetku ažurirati `mem://features/smart-split-wizard`:
- "Manual paragraph-scissors splitting (mirrors card editor `CuttingView`); first paragraph after cut becomes new module title."
- "No live-preview panel — wizard relies on inline editors only."
- Ukloniti spomen popovera/graničnika.
