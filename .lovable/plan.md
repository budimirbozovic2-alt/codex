# Plan: Premjestiti "Nova kartica" i "Masovni uvoz" u header kao ikone

## Cilj
Ukloniti dva široka dropdown dugmeta iz toolbara liste kartica. Premjestiti ih kao male ikone u header `SubjectCardsView`, pored postojećeg dugmeta za Memorizaciju (mozak), tako da pregled bude čistiji.

## Izmjene

### 1. `src/components/category/CardCreateMenu.tsx`
- Dodati treću vrijednost `size: "icon"` pored postojećih `"compact" | "prominent"`.
- Kada je `size="icon"`:
  - Triggeri postaju `Button variant="ghost" size="icon" className="h-8 w-8"` — bez teksta i chevrona, samo ikone (`Plus` za nova kartica, `Upload` za masovni uvoz).
  - `aria-label` i `title` zadržavaju "Nova kartica" / "Masovni uvoz" za pristupačnost i hover tooltip.
  - Wrapper `div` ostaje `flex items-center gap-1` (manji razmak za ikone).
- Empty-state (`prominent`) i compact varijante ostaju netaknute.

### 2. `src/views/SubjectCardsView.tsx` (header, ~lines 188-222)
- Dodati `<CardCreateMenu size="icon" ... />` neposredno **prije** dugmeta Memorizacija (`Brain` link).
- Proslijediti postojeće akcije iz konteksta: `addCard`, `addFlashCard`, `bulkAddFlashCards`, `importEssays` (preko `useBackupActions().importCards`), `categoryId`, i `allCategoryNames` izvedene iz `categoryRecords`.
- Renderovati ga samo kada je `tab === "manage"` i `manageMode === "edit"` (ne kada smo u Pasivnom/Brzom čitanju ili Strukturi).

### 3. `src/components/category/CardViewMode.tsx` (lines 159-169)
- Ukloniti `<div className="flex justify-center pb-1"><CardCreateMenu .../></div>` iz glavnog grananja (kada lista nije prazna). Time dropdown nestaje iz toolbara.
- **Zadržati** `CardCreateMenu size="prominent"` u empty-state granu (lines 120-135) — kada nema kartica korisnik treba prominentne CTA.
- Skinuti dovod `bulkAddFlashCards`/`addCard`/`addFlashCard` propsa iz `CardViewMode` u `SubjectCardsView` ostaje (potreban je za empty-state i za interne flowove tabele).

## Vizuelni rezultat
Header reda: `[← Nazad]  [📚 Naziv predmeta] [Esej: N] [Blic: M]    [➕] [⬆️] [🧠]`

Sve tri ikone su `h-8 w-8 ghost` dugmad, vizuelno usklađene sa Memorizacija ikonom.

## Bez izmjena
- `BulkImportDialog`, `MassFlashImportTrigger`, `AddCardDialog`, `DocxImporter` — logika ostaje nepromijenjena, mijenjaju se samo trigger-i.
- Onboarding, planner, strukturni dijalozi — nisu dirani.
- Empty-state CTA za prazan predmet i dalje pokazuje široka prominent dugmad.
