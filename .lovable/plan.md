## Dijagnoza

Prijašnji zaključak da je problem samo `sqlite3.wasm` više nije dovoljan: u trenutnom preview-u se vidi da se SQLite DEV fallback zaista pokreće, ali prekasno i na pogrešnom mjestu.

Relevantni signali:

- Boot dolazi do `ready`, ali tek oko 9.3s; panic timer je na 8s, pa korisnik lako vidi “blokadu” na splash ekranu.
- `listAllCards`, `listAllSources`, `listAllArticles` traju oko 3s jer se prvi SQLite/WASM init dešava tokom read path-a, ne kontrolisano na početku.
- Kôd i dalje ima mješavinu “read vrati [] ako executor ne postoji” i “write throw `NO_EXECUTOR`”, što stvara lažne uspjehe, prazne rezultate i pogrešne UI tokove.
- DOCX import koristi generički `mammoth` entry u browser worker-u; za browser bundlere je sigurniji `mammoth/mammoth.browser`, a trenutni worker nema dovoljno robustan fallback/error surface.
- Backup import UI zatvara dialog u `finally` čak i kad import logički ne uspije ili `useCardImport` interno samo toastuje i `return`-a, pa korisnik dobija utisak da je import “nemoguć” bez jasnog mjesta kvara.

Glavni zajednički izvor problema je **nestabilan persistence boundary**: SQLite executor se lazy inicijalizuje, greške se na nekim mjestima pretvaraju u prazne nizove/no-op, a UI zatim nastavlja kao da je operacija uspjela.

## Posljedice istog izvora

Osim prijavljenih problema, isti obrazac može pogađati:

- sporo prvo dodavanje/izmjenu kartice zbog `persistQueue.cleanup({ strict: true })` koji čeka cold SQLite init;
- izvore i mentalne mape koje mogu ostati van prikaza ako TanStack invalidacija zakasni ili se izgubi;
- backup restore koji može zatvoriti modal bez stvarnog uspjeha;
- health/backup readere koji mogu tiho vratiti prazne podatke ako executor nije dostupan;
- Zettelkasten/lazy migration tokove koji direktno zovu `saveSource`/slične funkcije bez TanStack rollback zaštite.

## Plan popravke

1. **Stabilizovati SQLite executor ugovor**
   - Uvesti jasan helper za “required executor”: write/backup/import tokovi moraju dobiti executor ili baciti eksplicitnu grešku.
   - Ne koristiti prazne nizove kao signal za “nema baze” u kritičnim read path-ovima za backup/import.
   - Zadržati DEV in-memory fallback, ali ga pokrenuti kontrolisano i ranije.
   - Uskladiti Vite konfiguraciju za `@sqlite.org/sqlite-wasm` prema preporuci paketa: izbaciti ga iz `optimizeDeps` prebundle-a i zadržati eksplicitni WASM asset URL.

2. **Ubrzati boot i ukloniti lažnu blokadu aplikacije**
   - Pre-warm SQLite executor u boot fazi prije paralelnih `listAll*` poziva.
   - Skinuti cold SQLite init sa `initMetacognitiveCache`/`initPlannerCache`/source/card read kritične staze gdje je moguće.
   - Podesiti panic timer tako da ne proglašava kvar dok kontrolisani boot još radi normalno.
   - Zadržati recovery UI za stvarne kvarove, ali ne forsirati “ready” usred validnog init-a.

3. **Popraviti dodavanje kartica bez gubljenja rollback sigurnosti**
   - Zadržati `strict` persistence provjeru nakon mutacija, ali nakon SQLite prewarm-a ona više ne smije čekati inicijalizaciju.
   - Zamijeniti microtask spin u `persistQueue.cleanup()` stabilnijim drain/promise mehanizmom.
   - Gdje je moguće, slati scoped `notifyCardsChanged` umjesto globalnog `kind: all`, da jedna kartica ne invalidira sve card query-je.

4. **Popraviti DOCX izvor import**
   - Prebaciti DOCX parser/worker na browser build: `mammoth/mammoth.browser`.
   - Popraviti worker `postMessage` transfer da ne klonira nepotrebno buffer.
   - Dodati pouzdan main-thread fallback ako worker bundle/import padne.
   - Greške parsiranja prikazati jasno; success toast tek nakon stvarno parsiranog i sačuvanog izvora.

5. **Popraviti source write + prikaz nakon save-a**
   - U `useSourceMutations` dodati `onSuccess/onSettled` safety invalidaciju za `sources.all()` i `sources.byCategory(categoryId)`.
   - Provjeriti sve call-site-ove koji zovu `saveSource` direktno: moraju unwrap-ovati `WriteResult` ili baciti grešku.
   - Isti obrazac provjeriti za mind maps i Zettelkasten article writes.

6. **Popraviti backup import tok**
   - `useCardImport.importData` treba vratiti jasan rezultat ili baciti grešku; ne smije interno samo `toast + return` za hard failure kada ga dialog tretira kao uspjeh.
   - `ExportImportDialog` zatvarati samo nakon potvrđenog uspješnog importa.
   - `applyImportAtomically` treba koristiti isti required-executor ugovor i jasnu poruku ako persistence nije dostupan.
   - Nakon uspješnog importa invalidirati sve relevantne query zone: cards, categories, sources, mindMaps, knowledgeBase, mnemonics, settings/review.

7. **Regresiona provjera**
   - Dodati/podesiti testove za:
     - više uzastopnih kartica bez blokiranja;
     - DOCX parser fallback i error handling;
     - source save vidljiv u scoped query cache-u;
     - backup import koji ne zatvara dialog na neuspjeh;
     - executor unavailable ne smije proizvoditi lažan uspjeh ili prazne backup podatke.
   - Ručno provjeriti u preview-u: boot prelazi splash bez panike, dodavanje kartice radi, DOCX izvor se pojavi, backup import ostaje otvoren na grešci i zatvara se samo na uspjehu.

## Kriterij uspjeha

- Boot nema 8s “panic” efekt u normalnom preview toku.
- Prvo dodavanje kartice ne čeka cold SQLite init.
- DOCX import daje stvarnu grešku ili stvarno prikazan novi izvor; nema lažnog success-a.
- Backup import ne nestaje tiho; neuspjeh ostavlja dialog otvoren i pokazuje konkretan razlog.
- Nema `read []` kao skrivenog persistence failure-a u kritičnim tokovima.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
  <presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>