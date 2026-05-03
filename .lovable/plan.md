## Cilj
Proširiti postojeću bulk selekciju u `CardViewMode` da uz "Obriši izabrane" omogući i bulk označavanje frekvencije pitanja (`često` / `rijetko` / `nikad` / ukloni tag) za sve izabrane kartice odjednom.

## Trenutno stanje
`src/components/category/CardViewMode.tsx` (linije 174–189) prikazuje selection toolbar sa samo dvije akcije: "Označi sve" i "Obriši izabrane". `setFrequency(cardId, value | null)` već postoji kao prop i koristi se per-row u `CardViewTable`.

## Izmjene

### `src/components/category/CardViewMode.tsx`
1. Dodati handler `handleBatchSetFrequency(value: FrequencyTag | null)`:
   - Iterirati `selectedIds`, pozvati `setFrequency(id, value)`.
   - Toast `Označeno N kartica kao "često"` (ili odgovarajuće), za `null` → `Uklonjen tag sa N kartica`.
   - NE izlaziti iz selection moda (korisnik može htjeti odmah obrisati ili re-tagovati). Ostaviti selekciju netaknutu.
2. U toolbaru (kada je `selectedIds.size > 0`) ubaciti kompaktnu grupu dugmadi prije "Obriši izabrane":
   - `Često` (variant `default`), `Rijetko` (variant `outline`), `Nikad` (variant `outline`), `Bez taga` (variant `ghost`).
   - Sve `size="sm"`, `h-7 text-xs`, sa kratkim `aria-label`-om.
   - Vizualni separator (`<span className="h-4 w-px bg-border" />`) između tag grupe i destruktivne "Obriši" akcije.
3. Bez novih propsa — `setFrequency` je već u scope-u.

### Bez izmjena
- `CardViewTable`, `CardViewFilterBar`, `useCardViewFilters` — netaknuti.
- Per-row frequency badge ostaje funkcionalan.
- Logika selekcije/exit-a nepromijenjena.

## Acceptance
- U selection modu sa ≥1 izabranom karticom prikazuju se 4 nova taga + postojeća "Obriši izabrane".
- Klik na tag dugme primjenjuje frekvenciju na sve izabrane, prikazuje toast, selekcija ostaje aktivna.
- Sa 0 izabranih kartica tagovi i delete su sakriveni (kao i sada).
- TypeScript prolazi čisto.