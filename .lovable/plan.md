## Problem

Kada korisnik tokom **aktivnog učenja** (`/learn`) ili **pasivnog čitanja** (Subject → Pasivno čitanje) klikne "Uredi karticu" i sačuva/odustane, vraća se na ekran ali **gubi flow**:

- `/learn` → vraća na **filter setup** (Filteri → Pokreni), umjesto na karticu na kojoj je radio.
- Pasivno čitanje → vraća na karticu s indeksom 0 umjesto na karticu koju je uređivao.

Razlog: `useEditReturn` snapshot ili nije bogat (LearnPage stashuje samo `path`), ili u PassiveReader/LearnSession ne postoji prop koji bi obnovio internal state (filteri, `started`, `currentIndex`, trenutni cardId).

EditPage već ima "Vrati me nazad" link (mali X tekst), ali nije dovoljno vidljiv.

## Rješenje

Proširiti edit-return snapshot za oba toka i obnoviti puno stanje na povratku, plus pojačati vidljivost dugmeta "Vrati me nazad" u EditPage-u.

### 1. LearnPage (`/learn`) — snapshot pune sesije

`useEditReturn` poziv proširiti sa `buildExtras`:
```ts
{ started, selectedCategory, selectedSubcategory, selectedChapter,
  sortMode, filterType, frequencyFilter, filterExamFrequent,
  currentIndex, viewWidth }
```

`LearnSession` dobija novi prop `restoreSnapshot?: LearnSessionSnapshot`. Ako je prosljeđen, lazy-init svi `useState` hookovi koriste vrijednosti iz snapshot-a (uključujući `started=true` da preskoči FilterSetup i ode direktno na karticu na kojoj je korisnik bio).

`LearnPage` čita `initialSnapshot` iz `useEditReturn` i prosljeđuje ga.

`editingCardRef.current.id` se koristi da, ako je card još u listi (mogla je biti splitovana/obrisana), `currentIndex` se ažurira da pokaže baš tu karticu — fallback na sačuvani index.

### 2. PassiveReader — vraćanje na uređenu karticu

`SubjectCardsView` već stashuje `tab: "read"`. Dodati novi extra:
```ts
passiveCardId: editingCardRef.current?.id
```

`SubjectCardsView` ako je `initialSnapshot.tab === "read"` postavlja `pendingPassiveCardId = initialSnapshot.passiveCardId` (PassiveReader već ima `initialCardId` prop koji skače na tu karticu — postojeća infrastruktura).

Isto za `tab: "speed"` → `pendingSpeedCardId`.

### 3. EditPage — vidljivije dugme "Vrati me nazad"

`CardForm` trenutno renderuje malu sivu "Vrati me nazad" labelu pored `X` ikone. Zamijeniti sa pravim **secondary button**-om (`<Button variant="outline" size="sm">` sa `ArrowLeft` ikonom + "Vrati me nazad") na lijevoj strani header-a forme, vidljivim samo kad je `editCard` prisutan. `X` ostaje za "zatvori bez snimanja".

Ova promjena daje jasan vizuelni call-to-action i potvrđuje korisniku da postoji explicit povratni mehanizam (čak i kad je flow spasen automatski).

### 4. Cleanup i edge-case

- Snapshot za `/learn` validira `categoryId` (ako filter sesije bio scoped) — `useEditReturn` to već radi automatski preko `BaseEditReturnSnapshot.categoryId`.
- Ako je editovana kartica obrisana ili više ne pripada filteru, `currentIndex` se klampuje na valjan opseg (već postoji defensive klamp u LearnSession).

## Fajlovi koji se mijenjaju

- `src/views/LearnPage.tsx` — prošireni `useEditReturn` sa `buildExtras` i prosljeđivanje `restoreSnapshot`.
- `src/components/LearnSession.tsx` — novi prop `restoreSnapshot`, lazy-init hookova iz snapshot-a.
- `src/components/learn/types.ts` — tip `LearnSessionSnapshot` + dodavanje u `LearnSessionProps`.
- `src/views/SubjectCardsView.tsx` — `buildExtras` dobija `passiveCardId`/`speedCardId`; useEffect koji postavlja `pendingPassiveCardId`/`pendingSpeedCardId` iz `initialSnapshot` na mount.
- `src/components/CardForm.tsx` — istaknuto "Vrati me nazad" dugme u header-u.

## Šta korisnik dobija

- Iz aktivnog učenja: edituje karticu → klikne "Vrati me nazad" (ili "Sačuvaj izmjene") → **odmah se vraća na istu karticu, isti filter, isti recall ekran**.
- Iz pasivnog čitanja: isti princip — vraća se na **istu karticu** unutar Pasivnog čitanja taba, sa svim filterima netaknutim.
- Vidljivo, eksplicitno dugme "Vrati me nazad" — više se ne oslanja na malu labelu kraj X-a.
