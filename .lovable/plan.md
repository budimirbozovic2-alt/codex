## Esej Wizard — pojednostavljenje i UX rehabilitacija

Cilj: **jedan ekran, čitljiv tekst, ručna podjela**. Ukloniti sve što sada zbunjuje (drugi ekran, sirovi HTML editor, automatska detekcija "Član X").

---

### Šta nestaje

1. **Drugi ekran ("Pregled prije importa")** — kompletni `previewAll` mode (linije 305–408 i toggle u footer-u + DirtyConfirmBar "Pregled za import" akcija). Pregled je već prisutan u right-pane editoru ("Pregled kartice" sekcija) — to je dovoljno.
2. **Automatska detekcija "Član X"** u `useSourceReaderActions.handleSelectionConvert`:
   - Više se ne poziva `splitSelection()` — wizard se uvijek otvara sa **jednim modulom** koji sadrži cijelu selekciju (kao da je već fallback grana).
   - Posljedica: nestaje "Smart-Split" branding. Naslov dijaloga postaje stalno "Kreiranje eseja".
3. **Mode toggle "Zasebne kartice / Jedan esej + moduli"** — više nije potreban jer korisnik počinje sa 1 modulom i ručno dodaje. Default ostaje `combined` (jedan esej sa modulima/sekcijama). Dugme "Zasebne kartice" se uklanja iz UI; logika `splitMode` ostaje u store-u sa fiksnom vrijednošću `"combined"` da postojeći testovi i builder funkcije rade.

   Alternativa ako korisnik kasnije zatraži: malen segmented switch ostaje, ali sklonjen ispod "Lokacija u predmetu" u jednu liniju.
4. **Sirovi HTML textarea** (linije 711–742) — zamijeniti **plain-text textarea** koji prikazuje `contentText` (ne `contentHtml`). Pri snimanju, plain text se konvertuje u sigurni HTML wrap (svaki paragraf/red u `<p>...</p>`) prije sanitizacije. Korisnik nikada ne vidi `<p>` tagove.
5. **"Skoči na sljedeći needitovan"** dugme — uklanja se (suvišno kad je sve na jednom ekranu).

### Šta ostaje i poboljšava se

- **Lokacija u predmetu** (Potkategorija + Glava) — ostaje na vrhu, nepromijenjeno.
- **Lijevi rail sa modulima** — ostaje (klik za skok, "+ Dodaj modul", trash po modulu, drag-to-reorder NIJE u skopu).
- **"Podijeli modul" popover** (Scissors) — **ostaje** jer je ključna ručna kontrola koju korisnik traži (podjela po praznoj liniji / Član X / custom delimiter). Premiješta se ispod tekst editora kao ispisno dugme umjesto popover-a u ugla, da bude vidljivije.
- **Naslov nadređenog eseja** — ostaje (jedan input).
- **Pitanje + sadržaj + tagovi + live pregled** — ostaju u right pane.
- **Nav dugmad ChevronLeft/Right** — ostaju kad je modula > 1.

### Novi flow (jedan ekran)

```text
┌─────────────────────────────────────────────────────────────┐
│ Kreiranje eseja                                       [×]   │
├─────────────────────────────────────────────────────────────┤
│ [Lokacija u predmetu: Potkategorija ▼] [Glava ▼]            │
│ [Naslov nadređenog eseja: __________________________]       │
├──────────────┬──────────────────────────────────────────────┤
│ MODULI       │  Modul 1 / 3      [Preskoči] [Obriši modul]  │
│ ─────────    │                                              │
│ ● 1 Uvod     │  Pitanje:  [textarea ___________________]    │
│   2 Pojam    │                                              │
│   3 Vrste    │  Sadržaj (običan tekst):                     │
│              │  [textarea sa plain tekstom, 8 redova]       │
│              │                                              │
│              │  [✂ Podijeli ovaj modul ▼]  ← inline button │
│              │                                              │
│ + Dodaj modul│  Tagovi: [#chip] [#chip] [+ dodaj]           │
│              │                                              │
│              │  Pregled kartice:                            │
│              │  [renderovan HTML, max-h 40, scroll]         │
├──────────────┴──────────────────────────────────────────────┤
│ [‹ Nazad] [Naprijed ›]      [Otkaži]  [✓ Kreiraj 3 modula]  │
└─────────────────────────────────────────────────────────────┘
```

Footer akcija **direktno kreira kartice** (bez međupregled-ekrana) → poziva postojeći `onSmartSplitConfirm`. Tekst dugmeta dinamičan: `Kreiraj esej (N modula)` ili `Kreiraj esej` kad je N=1.

### Tehnički koraci

1. **`src/components/source-reader/SmartSplitSummaryDialog.tsx`**
   - Ukloniti `previewAll` state + cijelu `previewAll && splitResult` granu.
   - Ukloniti mode toggle blok (412–449); zamijeniti tankom info linijom `{rangeLabel} · {keptCount}/{total} odabrano`.
   - Promijeniti naslov u stalno "Kreiranje eseja".
   - Premjestiti "Podijeli modul" popover ispod editora sadržaja (između tekst editora i tagova) kao puno dugme `<Button variant="outline" size="sm">`.
   - Zamijeniti HTML textarea (linije 711–742) sa plain-text textarea koji binduje `currentModule.contentText`. On change: 
     ```ts
     const text = e.target.value;
     const html = text
       .split(/\n{2,}/)
       .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
       .join('');
     updateModule(safeIndex, { contentHtml: html, contentText: text, plainSnippet: ... });
     ```
   - Ukloniti "Sljedeći needitovan" dugme.
   - Zamijeniti footer akcijsko dugme "Pregled svih (...)" sa direktnim `onSmartSplitConfirm` pozivom: `Kreiraj esej` / `Kreiraj esej (N modula)`.
   - DirtyConfirmBar `onSave` više ne ide u preview — direktno poziva `onSmartSplitConfirm`.

2. **`src/hooks/useSourceReaderActions.ts`** (`handleSelectionConvert`):
   - Ukloniti poziv `splitSelection()`. Uvijek graditi jedan synthetic modul iz cijele selekcije (postojeća fallback grana, linije ~94–109, postaje glavna).
   - `parentName` default = naslov izveden iz prve linije ili "Novi esej".

3. **`src/store/useSourceReaderStore.ts`**:
   - `splitMode` default ostaje `"combined"`. Builder funkcije nepromijenjene.
   - Ne uklanjati polje da ne pokvarim `buildSeparatePlans`/`buildCombinedPlan` ugovore i postojeće testove.

4. **Memorija**: ažurirati `mem://features/smart-split-wizard` da odražava novo ime "Esej čarobnjak", uklonjenu auto-detekciju i jednoekran flow.

### Što NE diram

- `selection-split-engine.ts` (`splitModuleByDelimiter`, `createEmptyModule`) — i dalje koristi za ručnu podjelu.
- `split-wizard-build.ts` (`buildCombinedPlan`, `buildSeparatePlans`, `defaultEdit`) — testovi nepromijenjeni.
- IDB persist sloj.
- Sanitizacija (`sanitizeHtml`) na confirm-time.

### Rizici

- **Postojeći eseji u IDB-u** — bez izmjene shema, samo UI/flow rad.
- **Test `split-wizard-build.test.ts`** — i dalje prolazi (builder logika netaknuta).
- **`splitMode` mrtav UI ali živ kod** — zadržava se da ne lomimo testove; cleanup može doći u kasnijem prolazu.