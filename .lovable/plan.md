

## Dijagnoza

Identifikovana su **dva nezavisna uzroka** koji daju utisak da su nedavne izmjene "polomile" hijerarhiju.

### Uzrok 1: Nove kategorije iz Settings ne vide se u Učenju/Konsolidaciji

**Nije regresija — postojeće ponašanje koje sad smeta zbog uvijek-vidljivih sekcija.**

- `LearnSession.tsx:47-50` filtrira `availableCategories` tako da prikazuje **samo kategorije koje imaju bar jednu karticu**:
  ```ts
  const cats = new Set(cards.map(c => c.categoryId));
  return categories.filter(c => cats.has(c));
  ```
- `ReviewSetup.tsx:40-43` `dueCategories` ide još uže — samo kategorije sa **due** karticama.
- Korisnik je u Settings dodao novi predmet, on je perzistiran u IDB i prikazuje se u Settings/Predmeti, ali **bez kartica** ne ulazi u listu filtera za Učenje/Konsolidaciju. Ranije (kad su sekcije Potkategorija/Glava bile sakrivene dok se ne izabere predmet) ovo nije bilo upadljivo. Sada, kad su sekcije uvijek vidljive, izostanak predmeta postaje očigledan.

### Uzrok 2: Prikaz UUID-a umjesto imena (CardList badges, filter pillovi)

**Realna mana — postoji ali samo u edge-case scenarijima.**

- `CardList.tsx:107-116` gradi `catNameMap` ali za chapter koristi prefix `"__ch_" + ch.id`, što očekuje da `ch` bude objekat `{id, name}`. Ako je u IDB-u zaostao **legacy string chapter** (stari format), `ch.id` je `undefined` → mapa dobija ključ `__ch_undefined` → CardRow prikazuje sirov UUID iz `card.chapterId`.
- `SessionFilters.tsx:71-80` (`subNameMap`) ima isti problem: provjerava `typeof n === 'object' && n.id`, ali ako je legacy string ostao, mapa neće imati taj ključ → fallback na `subNameMap[sc] || sc` (linija 237) prikazuje UUID.
- `useCardViewFilters.ts:24-26` (CategoryView filter bar) gradi `nameMap` čisto preko `sub.id` i `ch.id` što je u redu **kada su sve subkategorije normalizovane**. Ali ako u `categoryRecords` postoji subkategorija koja je objekat sa `{id, name}` ali kartica ima stari UUID koji više ne postoji u `categoryRecords` (orphan zbog raznih ranijih operacija), opet će se prikazati sirov UUID.
- Korijen je u tome da `useCards.ts:34-49` pretpostavlja sve subkategorije već imaju UUID format, ali `normalizeNode` u `useCategoryManagement.ts` se poziva tek kada se vrši mutacija. Nikad nije pokrenuta jednokratna **migracija postojećeg state-a na boot**.

## Plan popravke

### Popravka A — uklanjanje "fantomskog filtriranja" predmeta

Tri opcije:
- **A1 (preporučeno):** U `LearnSession.tsx` i `ReviewSetup.tsx` ne filtrirati `categories` po prisustvu kartica. Predmet bez kartica prikaže se u listi sa brojem `0`. Korisnik vidi sve svoje predmete i razumije zašto je kartice nema.
- **A2:** Ostaviti filtriranje, ali dodati natpis "Skriveno: predmeta bez kartica" sa dugmetom "Prikaži sve". Više koda za malo manje vrijednosti.
- **A3 (status quo):** Ne mijenjati. Ostaviti i dokumentovati. Ne preporučujem.

→ Idem sa **A1**: 2 izmjene (po jedna u svakom fajlu, ~3 linije).

### Popravka B — eliminisati prikaz sirovih UUID-a

- **B1:** U `useCards.ts` na bootu **jednokratno normalizovati `categoryRecords`** kroz `normalizeNode` ako otkrije bilo koji legacy string node. Persistovati nazad u IDB. Time mapping struktura postaje konzistentna i `subNameMap`/`nameMap` u svim komponentama radi pravilno bez izuzetaka.
- **B2:** U `CardList.tsx:112` graditi mapu glava i kada je `ch` string (legacy): `m["__ch_" + (typeof ch === 'string' ? ch : ch.id)] = typeof ch === 'string' ? ch : ch.name`. Defenzivni fallback ako migracija B1 nije završena.
- **B3:** U `SessionFilters.tsx` `subNameMap` dodati isti defenzivni fallback za legacy string nodes.
- **B4 (opcionalno):** U svim komponentama gdje se prikazuje sirov UUID kao fallback, zamijeniti sa "Nepoznato" + tooltip sa UUID-om radi debugiranja, da korisnik nikad ne vidi golu UUID-niz.

→ Idem sa **B1 + B2 + B3**. B4 izostavljam — UUID fallback ostaje korisno tehničko upozorenje za istinski orphan-e.

### Šta NE diram

- Logika filtriranja kartica (`filteredCount`, `sortedCards`) — radi ispravno.
- Layout `SessionFilters` panela (proširen prošli put) — ostaje.
- `useCategoryManagement` mutacije — već koriste `normalizeNode`.
- `CategoryView` strukturu i tabove.

## Fajlovi

1. **`src/hooks/useCards.ts`** — dodati `useEffect` koji nakon boota detektuje legacy string nodes u `categoryRecords` i pokreće jednokratnu migraciju (~20 linija). Idempotentno: ako je sve već UUID, no-op.
2. **`src/components/LearnSession.tsx`** — ukloniti filter `cats.has(c)` iz `availableCategories`. Sve predmetne kategorije postaju vidljive (~3 linije).
3. **`src/components/review/ReviewSetup.tsx`** — `dueCategories` koristi `categoryRecords.map(r => r.id)` umjesto skupa iz `dueCards` (~4 linije). Dodatno, count badge u SessionFilters već prikazuje 0 za prazne, što je ispravno.
4. **`src/components/CardList.tsx`** — defenzivni `catNameMap` koji baratati i sa legacy string chapters (~3 linije).
5. **`src/components/SessionFilters.tsx`** — defenzivni `subNameMap` za legacy string nodes (~3 linije).

**Ukupno: 5 fajlova, ~33 linije izmjena. Nijedna funkcionalnost ne uklanja se.**

