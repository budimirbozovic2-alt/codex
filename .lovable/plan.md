## Cilj

Dodati **lagane, opcione tagove** člancima u Zettelkastenu kao pomoćni filter u Explorer panelu. Tagovi **ne nameću strukturu** — ne zamjenjuju potkategorije, ne učestvuju u pretrazi, ne formiraju hijerarhiju. Članak može imati 0 tagova; tag može postojati samo na jednom članku.

## Filozofija

Tagovi su "miris" koji korisnik prati kad istražuje veću mrežu — dodaje ih po želji, briše bez posljedica, ne moraju pratiti nikakvu konvenciju. Cilj im je sužavanje vidljive liste u Explorer-u, **ne** organizacija sadržaja.

## Šta gradimo

### 1. Schema (`src/lib/db-schema.ts`)
Dodati opciono polje na `KnowledgeBaseArticle`:
```ts
/** Lightweight, free-form tags used purely as Explorer-side filters. */
tags?: string[];
```
Bez Dexie migracije — Dexie tolerantno tretira nova polja. Postojeći redovi su validni (undefined → "bez tagova").

### 2. Tag helpers (`src/lib/zettelkasten-tags.ts`, novi fajl)
Pure funkcije, bez DB/React coupling-a:
- `normalizeTag(raw)` — strip vodećeg `#`, lowercase, trim, internal whitespace → `-`, drop ne-alfanumeričkih (čuva diacritike), cap 32 char.
- `normalizeTagList(raw)` — normalizacija + dedup uz očuvan redoslijed prve pojave, cap 8 tagova po članku.
- `getTagCounts(articles)` — agregat `Map<tag, count>` sortiran po opadajućoj učestalosti pa alfabetski.
- `filterByActiveTags(articles, activeSet)` — **OR** semantika (članak prolazi ako ima bar jedan aktivni tag). Praznoj activeSet propušta sve. OR je biran namjerno — istraživanje, ne sužavanje.
- Konstante: `TAG_LIMITS = { maxPerArticle: 8, maxTagLength: 32 }`.

### 3. Tag editor u članku (`ZettelkastenView` — edit mod samo)
Ispod `LinkedSourcesPicker` u edit modu, dodati novu sekciju `ZettelTagEditor`:
- Mali horizontalni strip: postojeći tagovi kao chip-ovi sa "×" za uklanjanje + jedan input za dodavanje.
- Enter ili zarez → dodaj tag (kroz `normalizeTag`); duplicate ignorisan tihim no-op-om.
- Kad se dosegne `maxPerArticle`, input postaje disabled sa hint tekstom "Maks. 8 tagova".
- Tagovi se pišu u `draft.tags`; persist ide kroz postojeći `flushDraft` — dodajem `tags` u `Draft` interface i u dirty-check (`sameStringSet(draft.tags, activeArticle.tags ?? [])`).
- **Ne pojavljuje se u read modu** — tagovi su organizacioni signal, ne sadržaj članka. (Ako želiš, kasnije možemo dodati nenametljiv chip strip ispod naslova i u read modu — javi.)

### 4. Tag filter u Explorer panelu (`ZettelExplorerPanel`)
Ispod Sort dropdown-a, novi blok "Tagovi":
- Horizontalni wrap chip-ova svih korištenih tagova u predmetu (kroz `getTagCounts(articles)`), svaki sa countom u zagradi.
- Klik = toggle u lokalnom `activeTags: Set<string>`.
- Aktivni chip ima `bg-primary/15` + bold; neaktivni `bg-muted/40`.
- Mali "Očisti" link kad je `activeTags.size > 0`.
- Skriva se ako predmet nema nijedan tag (prazan blok bi bio šum).

`visible` memo se proširuje:
```ts
let list = articles.slice();
list = filterByActiveTags(list, activeTags);  // pre-filter
if (q) list = list.filter(a => a.title.toLowerCase().includes(q));
// ... existing sort + Index pinning
```
Index članak je **uvijek vidljiv** bez obzira na aktivne tagove (entry-point ne smije nestati iz panela).

### 5. Tag chip-ovi u Explorer redu članka
Ispod naslova svakog reda, ispod backlink count-a:
- Prva 3 taga kao mali chip-ovi (`text-[9px] px-1.5 py-0 rounded-sm bg-muted/40`).
- Ako ih ima više: dodatni chip "+N" (npr. "+2").
- Ne renderuje se ako članak nema tagove.
- Klik na chip u listi = toggle istog filtera (brza navigacija).

### 6. Helpers u storage (`zettelkasten-storage.ts`)
- U `saveArticle`: prije `put`-a, normalizuj `tags` kroz `normalizeTagList` (defensivno, da se UI bug-ovi ne presele u IDB).
- U `newArticle`: bez tagova po defaultu.
- `ensureIndexArticle`: Index dobija prazan `tags: []` (ne dodajemo automatske tagove iz subject-name-a — to bi bila skrivena struktura).

## Tehnički detalji

### Performanse
- `getTagCounts(articles)` je O(N × avgTagsPerArticle); cachiran kroz `useMemo([articles])` u Explorer panelu.
- `filterByActiveTags` je O(N × tags) sa Set lookup-om — beznačajno čak na 5000 članaka.
- `Draft` proširenje sa `tags` ne uvodi novi listener — ide kroz isti `flushDraft` flow.

### Edge cases
- Postojeći članci bez `tags`: tretiraju se kao prazna lista. Tag filter ih isključuje (osim Index-a).
- Stale tag u `tags` koji više nije normalizovan (defenziva za starije redove): `getTagCounts` i `filterByActiveTags` re-normalizuju u letu, ne pretpostavljaju invariantu.
- Brisanje članka: tagovi nestaju s njim; `getTagCounts` automatski refleksuje sljedeći render.
- Duplicate tag pri dodavanju: tihi no-op (UI ne baca toast).
- Cap od 8: input se disable-uje, ne baca grešku.

### Tipovi
`Draft` u `ZettelkastenView`:
```ts
interface Draft {
  title: string;
  content: string;
  linkedSourceIds: string[];
  tags: string[];   // nova
}
```
Sve mjesta gdje se `Draft` kreira ili upoređuje (`flushDraft`, `handleEnterEdit`, `handleCreate`, `handleOpen`) ažurirana da uključe tags.

## Testovi

`src/test/zettelkasten-tags.test.ts`:
- `normalizeTag`: `"#  Načelo "` → `"načelo"`, `"Ljudska Prava"` → `"ljudska-prava"`, sječenje na 32 char, prazan input → `""`, drop interpunkcije.
- `normalizeTagList`: dedup uz očuvan redoslijed, cap 8, drop praznih.
- `getTagCounts`: sortiranje po opadajućoj učestalosti pa alfa, dedup unutar jednog članka, ignoriše članke bez tagova.
- `filterByActiveTags`: prazna activeSet propušta sve; OR semantika; member match na re-normalized stale tag.

(Nema integracionog testa za UI editor — već postoji solidan flushDraft test set.)

## Šta se NE mijenja

- Backlink indeks, wiki-link auto-create, Index članak, persistence flow — netaknuti.
- Pretraga po naslovu — ne uključuje tag matching (namjerno: pretraga ostaje "naslov", filter ostaje "tagovi").
- Read mode članka — bez tag prikaza (može se dodati kasnije ako bude trebalo).
- `rootSubcategoryId` — ostaje legacy no-op.

## Redoslijed izvršavanja

1. `tags?` polje u shemi.
2. `zettelkasten-tags.ts` helpers + testovi.
3. `ZettelExplorerPanel` — filter chip strip + filter primjena + tagovi u redu članka.
4. `ZettelkastenView` — `Draft.tags`, dirty check, normalizacija pri save-u, tag editor sekcija u edit modu.
5. Update memorije `mem://features/zettelkasten-organic`.
