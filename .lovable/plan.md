# Jasniji tekstovi na preklopniku View ↔ Org

## Problem

Na preklopniku unutar taba **"Uređivanje i raspored kartica"** trenutno stoji:
- `View — pregled i uređivanje`
- `Org — struktura i raspored`

Skraćenice "View" i "Org" su engleske i korisnik ne zna odmah šta će se promijeniti kad klikne. Treba da prvi pojam u dugmetu bude crnogorski i sam za sebe razumljiv, a "View"/"Org" da ostanu samo kao mali tehnički sufiks (ili da se uklone iz vidljivog teksta i čuvaju u tooltipu).

## Predloženi tekstovi (dvodijelni: jasna akcija + kratki kontekst)

| Pod-mode | Vidljivi tekst dugmeta | Tooltip / aria-label |
|---|---|---|
| `edit` | **Pregled i uređivanje** (View) | "Pregled i uređivanje kartica — lista, pretraga, filteri, otvaranje kartice" |
| `structure` | **Struktura i raspored** (Org) | "Struktura i raspored kartica — hijerarhija, glave, drag & drop" |

Vidljivi tekst počinje crnogorskom oznakom akcije (ono što korisnik radi), a engleska oznaka stoji u zagradi kao mala diskretna kratica radi konzistentnosti sa internom terminologijom (`View`/`Org`) koju koristimo u memoriji i komentarima.

Ikonice (`LayoutList` za View, `Network` za Org) ostaju iste i pojačavaju značenje.

## Mjesta za izmjenu

### 1) `src/views/SubjectCardsView.tsx` (linije 215–244)

- View dugme:
  - Tekst: `Pregled i uređivanje` + mala oznaka `<span className="opacity-60">(View)</span>`
  - `title` / `aria-label`: `"Pregled i uređivanje kartica — lista, pretraga, filteri"`
- Org dugme:
  - Tekst: `Struktura i raspored` + mala oznaka `<span className="opacity-60">(Org)</span>`
  - `title` / `aria-label`: `"Struktura i raspored kartica — hijerarhija, glave, drag & drop"`

### 2) Sinhronizacija preostalih pomena (kanonski rječnik)

Da svi unutrašnji pomeni i dalje upućuju na **isti** vidljivi naziv:
- `src/components/category/SubjectHierarchyTree.tsx` (linija 233):
  prazan-state → `"Nema potkategorija. Dodaj ih u \"Struktura i raspored\"."`
  *(uklanjamo prefiks "Org —" iz pomena jer nije dio glavnog vidljivog teksta dugmeta.)*
- `src/components/card-form/MetadataSection.tsx` (linija 117):
  hint → `"Koristite \"Struktura i raspored\" u prikazu kartica za dodavanje glava."`
- Memoriju `mem://features/subject-cards-hub-v2` ažurirati: kanonski vidljivi nazivi su sada **"Pregled i uređivanje"** i **"Struktura i raspored"**, sa internim oznakama View/Org u zagradi i tooltipu.

## Šta se NE dira

- Internal state `manageMode: "edit" | "structure"`, `localStorage` ključevi, `EditReturnSnapshot`.
- Top-level tab "Uređivanje i raspored kartica" ostaje isti.
- Ikonice ostaju iste.

## Rezultat

Korisnik na prvi pogled vidi **"Pregled i uređivanje"** vs **"Struktura i raspored"** — dvije jasne akcije na crnogorskom. Mala oznaka `(View)` / `(Org)` ostaje kao diskretni indikator pod-moda za one kojima treba kratak label, a tooltip dodatno objašnjava šta tačno mijenja.
