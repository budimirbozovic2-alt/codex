## Cilj
Ukloniti binarni `tags[]` sloj za "često/rijetko na ispitu" i sve UI/filter putanje preusmjeriti na `Card.frequencyTag` (`"često" | "rijetko" | "nikad"`). `tags[]` ostaje samo za nesemantičke flagove (`MNEMONIC_TAG`).

## UX odluka — Flame kontrola u listi

Umjesto jednog Flame dugmeta koristiti **mali dropdown sa 4 opcije** (`Često`, `Rijetko`, `Nikad`, `Ukloni oznaku`) s ikonom koja se boji prema trenutnoj vrijednosti:
- `često` → Flame, `text-destructive`
- `rijetko` → Flame, `text-warning`
- `nikad` → Flame, `text-muted-foreground/60`
- nepostavljeno → Flame, `text-muted-foreground/40` (outline)

Razlog protiv 3-state ciklusa: korisnik ne vidi sve opcije bez probe i lako pogriješi klikom.

## Izmjene po fajlu

### `src/lib/sr/format.ts`
- Ukloniti export `CARD_TAGS` i konstantu `"rijetko-na-ispitu"`. `EXAM_FREQUENT_TAG` i `MNEMONIC_TAG` ostaju (MNEMONIC se koristi nezavisno; `EXAM_FREQUENT_TAG` privremeno ostaje samo radi tihe migracije starih `tags[]`).

### `src/lib/spaced-repetition.ts` (re-eksport barel)
- Ukloniti `CARD_TAGS` iz re-eksporta ako postoji.

### Novi helper `src/lib/sr/frequency.ts` (mali, čist)
- `setCardFrequency(card, value: FrequencyTag | null): Card` — vraća novi card sa postavljenim/poništenim `frequencyTag` i istovremeno čisti naslijeđene tagove `"često-na-ispitu"`/`"rijetko-na-ispitu"` iz `tags[]` (silent migration on touch).
- `getFrequencyMeta(value): { label, icon, colorClass }` — single source of truth za boje i etikete u UI.

### `src/hooks/useCardCRUD.ts`
- Već ima `updates.frequencyTag` u `updateCard`. Izložiti **novi pomoćni callback** `setFrequency(cardId, value: FrequencyTag | null)` koji koristi `patchCard` direktno (O(1) bez prolaska kroz `updateCard` koji radi i ostala polja). Ovo je zamjena semantike za stari `toggleTag(EXAM_FREQUENT_TAG)`.
- Izložiti ga kroz `CardActionsProvider` (`useCardOnlyActions`) kao `setFrequency`.

### `src/hooks/useCardAnnotations.ts`
- `toggleTag` ostaje (potreban za `MNEMONIC_TAG`), ali se više ne koristi za EXAM tagove iz UI.

### `src/views/SubjectCardsView.tsx`
- Proslijediti `setFrequency` iz konteksta kroz `CardViewMode` umjesto `toggleTag` za frequency-namjeru. `toggleTag` zadržati samo ako se još koristi za mnemonic clone path.

### `src/components/card-list/CardRow.tsx`
- Ukloniti uvoz `EXAM_FREQUENT_TAG` i `isFrequent` boolean.
- Zamijeniti Flame `<button>` s novim `<FrequencyMenu card setFrequency />` (opisan ispod).
- Ukloniti prop `onToggleTag` ako se više ne prosljeđuje (ostaviti samo `setFrequency` prop; `onToggleTag` ostaje za `CardContextMenu` ako mnemonic clone i dalje ide kroz njega).

### Nova komponenta `src/components/card-list/FrequencyMenu.tsx`
- Mali `DropdownMenu` (već postoji shadcn `dropdown-menu`).
- Trigger: Flame ikona obojena prema `card.frequencyTag` (vidi `getFrequencyMeta`).
- Items: `Često` / `Rijetko` / `Nikad` / separator / `Ukloni oznaku`.
- Poziva `setFrequency(card.id, value | null)`.

### `src/components/card-list/CardContextMenu.tsx`
- Ukloniti EXAM_FREQUENT_TAG stavku.
- Dodati submenu "Frekventnost" sa 4 opcije (često/rijetko/nikad/ukloni). MNEMONIC clone stavka ostaje netaknuta.

### `src/components/category/CardViewTable.tsx`
- Ukloniti red sa `CARD_TAGS.map(...)` pill dugmadi i `toggleTag` prop iz potpisa (ako više nije potreban). Dodati istu `<FrequencyMenu>` (ili kompakt ekvivalent) u kontrolnu zonu kartice.

### `src/components/category/CardViewFilterBar.tsx`
- Zamijeniti `Select` "Tag" sa `Select` "Frekventnost" sa opcijama: `Sve` / `Često` / `Rijetko` / `Nikad` / `Bez oznake`. Koristiti `FREQUENCY_TAGS` za labele.

### `src/hooks/useCardViewFilters.ts`
- Preimenovati `filterTag: string | null` → `filterFrequency: "all" | FrequencyTag | "none"`. Zamijeniti uslov u `filteredCards`:
  - `"all"` → bez filtera
  - `"none"` → `card.frequencyTag === undefined`
  - inače → `card.frequencyTag === filterFrequency`
- Update `hasActiveFilters` i `resetFilters` (`"all"` umjesto `null`).
- Zadržati backward-compatible `initial*` parametre, ali sada `initialFrequency` (string).

### `src/components/category/CardViewMode.tsx`
- Update `Props` (`toggleTag` više nije potrebno za frequency; predati `setFrequency`).
- Update `CardViewFiltersSnapshot`: `tag: string | null` → `frequency: "all" | FrequencyTag | "none"`.
- Provjeriti gdje se snapshot serijalizuje/deserijalizuje (edit-return u `SubjectCardsView`) i prilagoditi.

### `src/components/learn/SessionHeader.tsx`
- Zamijeniti `tags?.includes(EXAM_FREQUENT_TAG)` badge sa renderom `card.frequencyTag` ako je postavljen (badge u jednoj od tri boje preko `getFrequencyMeta`).

### `src/components/CardForm.tsx` / `src/components/card-form/MetadataSection.tsx`
- Već je ispravan (dropdown sa 3 opcije + `__none__`). Bez izmjena.

## Tiha migracija starih podataka
- `setCardFrequency` čisti `"često-na-ispitu"` i `"rijetko-na-ispitu"` iz `tags[]` pri svakom dodiru (lazy).
- Dodati jednokratnu read-time normalizaciju u `useCardAnnotations`/`patchCard` putanji? **Ne** — preskupo i nepotrebno; lazy je dovoljno. Stari tagovi na nedirnutim karticama više nigdje neće biti čitani (nema više `CARD_TAGS` ni `EXAM_FREQUENT_TAG` checks u UI), pa će se "razgraditi" prirodno.
- `EXAM_FREQUENT_TAG` konstanta ostaje deklarisana u `format.ts` (samo za backup-schema validator i future cleanup), ali se nigdje ne koristi za UI logiku.

## Testovi / sanity
- `src/test/spaced-repetition.test.ts`: već testira `frequencyTag`, ostaje.
- Nije potrebno mijenjati `backup-schema.ts` (akceptira oba sloja nezavisno).

## Rizik / kompatibilnost
- Postojeće kartice sa starim `tags[]` će izgubiti vizuelnu Flame oznaku jer je to dugme uklonjeno; korisnik mora jednom postaviti `frequencyTag` ako želi vraćenu oznaku. Alternativa: jednokratni boot-time migration job koji za sve `cards` pretvara `tags[].includes("često-na-ispitu")` u `frequencyTag = "često"` ako `frequencyTag` nije već postavljen. **Preporuka: uradi ovaj jednokratni boot-time migration**, da korisnik ne izgubi oznake. Lokacija: u `db-schema.ts` v17 upgrade ili u `AppContext` boot fazi (jednostavnije, bez nove sheme).

Treba mi potvrda samo o jednoj stvari: **migracija postojećih `"često-na-ispitu"` tagova u `frequencyTag = "često"` — da uradim ili ne?** Ako da, dodaću je u boot fazi `AppContext`-a.
