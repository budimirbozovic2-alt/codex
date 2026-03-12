

## Plan: Tri izmjene u aplikaciji Memoria

### 1. Početna strana = samo statistika, dugme "Ponavljaj" u navigaciju

**Trenutno:** Dashboard sadrži statistiku + dugme "Ponavljaj". Navigacija: Početna, Uči, Kartice, Kategorije, Nova.

**Promjena:**
- Ukloniti dugme "Ponavljaj" iz `Dashboard.tsx` (ukloniti `onStartReview` prop i dugme)
- Dodati "Ponavljaj" kao stavku navigacije u `Index.tsx` pored "Uči" sa ikonom `Brain`
- Nav redoslijed: Početna, Ponavljaj, Uči, Kartice, Kategorije, Nova
- Dodati badge na "Ponavljaj" dugme sa brojem kartica za ponavljanje (`stats.due`)

**Fajlovi:** `Index.tsx`, `Dashboard.tsx`

---

### 2. Blic pitanja — nova vrsta kartica bez cjelina

**Koncept:** Blic pitanja su kratka pitanja sa jednim direktnim odgovorom (bez podjele na cjeline). Tretiraju se kao zasebna vrsta kartice.

**Data model promjene:**
- Dodati `type: "essay" | "flash"` polje na `Card` interfejs u `spaced-repetition.ts`
- Blic kartice imaju tačno jednu sekciju (interno), ali UI ih prikazuje kao pitanje/odgovor bez koncepta "cjelina"
- Nova funkcija `createFlashCard(question, answer, category)` koja kreira karticu sa `type: "flash"` i jednom skrivenom sekcijom
- Migracija: postojeće kartice dobijaju `type: "essay"` u `storage.ts`

**UI promjene:**
- **CardForm:** Dodati toggle na vrhu forme: "Esejsko pitanje" / "Blic pitanje". Kad je blic — prikazati samo jedno polje za odgovor (bez naziva cjeline, bez dodavanja cjelina, bez rezanja)
- **CardList:** Blic kartice imaju drugačiji badge ("Blic" umjesto "X cjelina"). Expandovani prikaz pokazuje odgovor direktno
- **ReviewSession:** Blic kartice se ponavljaju isto ali bez prikaza "cjelina 1/1" — prikazuju pitanje i odgovor
- **LearnSession:** Blic kartice prikazuju odgovor direktno bez expandable sekcija
- **Kartice view (Index.tsx):** Dodati filter tab "Esejska" / "Blic" / "Sve" pored kategorija

**Fajlovi:** `spaced-repetition.ts`, `storage.ts`, `useCards.ts`, `CardForm.tsx`, `CardList.tsx`, `ReviewSession.tsx`, `LearnSession.tsx`, `Index.tsx`

---

### 3. Dva nivoa kategorija (kategorija + podkategorija)

**Koncept:** Umjesto flat liste kategorija, uvesti hijerarhiju: Kategorija > Podkategorija. Svaka kartica pripada jednoj kategoriji i opciono jednoj podkategoriji.

**Data model:**
- Kategorije ostaju flat lista (gornji nivo)
- Dodati `subcategories` strukturu: `Record<string, string[]>` — mapira kategoriju na listu podkategorija
- Na `Card` dodati `subcategory?: string` polje
- Storage: novi ključ `sr-essay-subcategories` u localStorage

**UI promjene:**
- **CategoryManager:** Svaka kategorija je expandable — klikom se prikazuju podkategorije ispod. Dodavanje/preimenovanje/brisanje podkategorija unutar kategorije
- **CardForm:** Nakon izbora kategorije, prikazati drugi Select za podkategoriju (opciono). Opcija "Nova podkategorija"
- **CardList (Kartice view):** Dvostepeni filter — prvo kategorija, pa podkategorija. Prikaz podkategorije na kartici
- **Dashboard:** Statistike grupišu i po podkategorijama
- **ReviewSession/LearnSession:** Filter po podkategoriji unutar kategorije

**Fajlovi:** `spaced-repetition.ts`, `storage.ts`, `useCards.ts`, `CategoryManager.tsx`, `CardForm.tsx`, `CardList.tsx`, `Dashboard.tsx`, `ReviewSession.tsx`, `LearnSession.tsx`, `Index.tsx`

---

### Redoslijed implementacije

1. Premjestiti "Ponavljaj" u navigaciju (najmanji zahvat)
2. Dodati podršku za blic pitanja (data model + UI)
3. Dodati dva nivoa kategorija (data model + UI kroz cijelu aplikaciju)

### Tehnički detalji

- Migracija podataka: `migrateCard()` u `storage.ts` dodaje `type: "essay"` i `subcategory: ""` na postojeće kartice
- Blic kartice interno koriste jednu Section za SR algoritam — nema promjena u `calculateNextReview`
- Podkategorije se čuvaju odvojeno od kategorija u localStorage za backward compatibility
- Svi filteri (kartice, ponavljanje, učenje) dobijaju opcioni drugi nivo filtriranja

