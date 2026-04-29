## Dijagnoza

Korisnik vidi sirove "stringove brojeva i slova" (UUID-ove) umjesto imena podkategorija/glava jer trenutni render fallback je `card.subcategoryId` ili `card.chapterId` kad se taj UUID **ne pronađe** u trenutnoj `category.subcategories`.

Glavni izvor problema:

- `src/components/category/org-mode/org-mode-utils.ts` (`buildTree`) — kartice se grupiraju po `card.subcategoryId`. Ako taj UUID nije u `nodeMap` (jer pripada obrisanoj/zamijenjenoj subkategoriji), kreira se "fantomski" node sa subcategorijom = sirovi UUID.
- `src/components/category/CardViewTable.tsx:114-115` — fallback `?? card.subcategoryId` i `?? card.chapterId`.
- HealthMonitor (`src/components/HealthMonitor.tsx:98-100`) detektuje samo orphan kategorije — nema detekcije za stale `subcategoryId` / `chapterId` (drift nakon restore-a, importa, ili rebuild-a strukture).

Posljedica: kartice koje imaju validan `categoryId`, ali stale `subcategoryId`/`chapterId`, **prikazuju se kao "neraspoređene"** u Org modu i u listi pokazuju goli UUID umjesto naziva.

## Plan ispravke (3 sloja)

### 1. Auto-resolve sloj — fallback po imenu (nedestruktivno)

U `buildTree` i `CardViewTable`, kad UUID ne match-uje, **pokušaj naći node po `name`** (pogodi cross-rebuild slučajeve gdje je ime ostalo isto). Ovo NE mijenja podatke, samo poboljšava prikaz — ali zahtijeva da kartica negdje nosi i staro ime. Trenutno ne nosi → ovaj sloj ne pomaže direktno.

Umjesto toga, za prikaz: kad nema match-a, **prikaži `(Nepoznata podkategorija)` umjesto golog UUID-a** i grupiraj sve takve kartice u poseban "Neraspoređeno (zastarjele veze)" čvor sa akcijom "Premjesti".

### 2. Health Monitor — proširena orphan detekcija

`src/components/HealthMonitor.tsx`:

- Sastavi `validSubIds = Set(svi node.id iz svih kategorija)` i `validChapIds = Set(svi chapter.id)`.
- `staleSubcat = cards.filter(c => c.subcategoryId && !validSubIds.has(c.subcategoryId))` — kartica ima sub UUID koji ne postoji.
- `staleChap = cards.filter(c => c.chapterId && !validChapIds.has(c.chapterId))` — kartica ima chapter UUID koji ne postoji.
- Cross-check: kartice gdje `chapterId` postoji ali pripada **drugoj** podkategoriji od njene `subcategoryId` (mismatch).
- Prikaži dvije nove statističke linije ("Stare veze sa podkategorijama: N", "Stare veze sa glavama: M") + dva dugmeta za čišćenje:
  - **"Resetuj zastarjele subcategoryId"** → `db.cards.update(id, { subcategoryId: "", chapterId: "" })` (chapter se mora isprazniti jer pripada subu).
  - **"Resetuj zastarjele chapterId"** → samo `chapterId: ""`.
- Nakon čišćenja: `eventBus.emit(EVENT_TYPES.CARDS_UPDATED)`.

### 3. Auto-heal pri boot-u (jednokratna migracija)

Nova lightweight migracija u `src/lib/db-seed.ts` (ili novi fajl `src/lib/migrations/heal-card-taxonomy.ts`) koja se okida samo ako flag `localStorage["taxonomy-healed-v1"]` ne postoji:

1. Učitaj sve kategorije i sve kartice.
2. Sastavi `subUuidSet` i `chapUuidSet`.
3. Za svaku karticu sa stale `subcategoryId` ili `chapterId`:
   - **Pokušaj remap po imenu**: ako je negdje (npr. u dnevniku, sourcetag-u, ili kroz `card.tags`) sačuvano ime stare podkategorije, traži match. Ako nema — postavi na `""`.
   - Konzervativno: ako match po imenu uspije unutar **iste** `categoryId`, dodijeli novi UUID.
4. Setuj flag i emituj `CARDS_UPDATED`.

Pošto većina karticama nema sačuvano staro ime, fokus je na **čistom resetu** (varijanta b) — kartice ostaju u kategoriji, ali se "vraćaju" u "Neraspoređeno" gdje ih korisnik može drag-drop-om dodijeliti tačnim podkategorijama (već postoji UI u CardOrgMode).

### 4. Vizualna jasnoća u Org modu

`org-mode-utils.ts` `buildTree`:

- Umjesto da kreira fantomski node sa golim UUID-om kao `subcategory` imenom, **sve kartice sa nevažećim `subcategoryId` smjesti u UNCAT bucket** (kao da je `subcategoryId` prazan), ali ih **vizualno označi** flag-om `staleLink: true` na nivou kartice — Org panel pokazuje narandžasti badge "veza istekla" pored takvih kartica i hint za premjestiti ih.
- Dodatno polje `TreeNode.staleSubcategoryUuids: string[]` ili jednostavno još jedan bucket "Zastarjele veze ({N})" koji se eksplicitno renderuje na vrhu tek ako ima članova, sa tooltipom: "Ove kartice su pripadale podkategorijama koje više ne postoje. Premjesti ih ili pokreni Health Monitor čišćenje."

### 5. CardViewTable cleanup

`src/components/category/CardViewTable.tsx:112-138`:

- Zamijeni `?? card.subcategoryId` sa `?? "(Nepoznato)"` i obojii badge u `bg-warning/15 text-warning`.
- Isto za `chapterId`.

## Fajlovi

- **Izmjena:** `src/components/category/org-mode/org-mode-utils.ts` — UNCAT konsolidacija, novi bucket "stale", remap stale → unassigned.
- **Izmjena:** `src/components/category/CardViewTable.tsx` — humanizirani fallback labeli sa upozoravajućim badge-om.
- **Izmjena:** `src/components/HealthMonitor.tsx` — dvije nove orphan kategorije + cleanup dugmad.
- **Novo:** `src/lib/migrations/heal-card-taxonomy.ts` — boot-time migracija (resetuje stale veze) sa `localStorage` flagom.
- **Izmjena:** `src/lib/db-seed.ts` (ili `src/AppContext`) — pozvati migraciju pri boot-u nakon učitavanja kategorija.

## Garancije

- Migracija je **konzervativna**: nikad ne izmišlja UUID-ove, samo prazni stale reference. Kartice ostaju u svojoj kategoriji.
- Korisnik dobiva jasnu vizualnu indikaciju + dva alata za čišćenje (auto pri boot-u + ručno preko Health Monitor-a).
- Drag & Drop u Org modu već radi — korisnik premješta kartice u prave podkategorije nakon čišćenja.
- Bez gubitka podataka (`question`, `sections`, `categoryId`, FSRS state) — ostaju netaknuti.