
Cilj je da ne “nagađamo”, nego da tačno izmjerimo u kojoj fazi boot staje i zašto splash ostaje na 0%.

1. Najvjerovatniji uzrok koji sam identifikovao
- Splash na 0% znači da se `useCards` inicijalizacija uopšte ne izvršava, jer prvi pomak na 5% nastaje tek u `useCards.ts`.
- U `src/main.tsx` se `App` i `db` importuju prije registracije `window.onerror` i `window.onunhandledrejection`.
- Ako pukne bilo koji import-time kod prije `createRoot(...).render(<App />)`, fallback error UI i splash timeout se nikad ne registruju.
- Posebno rizično:
  - `src/lib/db.ts` ima module-scope `export const db = new MemoriaDB();`
  - `src/main.tsx` direktno importuje `db`
  - `App.tsx` pri mountu povlači `AppProvider`, `MainLayout`, lazy rute i provider lanac
  - više mjesta rade direktan pristup `document`, `window`, `localStorage`

2. Šta bih implementirao da detektujemo tačnu tačku zastoja
- Uvesti eksplicitni “boot tracer” sa fazama, npr:
  - `main:module-start`
  - `main:error-handlers-registered`
  - `main:theme-init-start/end`
  - `main:react-render-start/end`
  - `app:component-enter`
  - `cards:init-start`
  - `cards:db-open-start/end`
  - `cards:migration-start/end`
  - `cards:data-load-start/end`
- Svaku fazu zapisivati na dva mjesta:
  - u `console`
  - u `window.__bootTrace` / `sessionStorage`
- Na splash screen dodati mali debug red: “Posljednja faza: ...” da odmah vidimo gdje staje.

3. Najvažniji refaktor za pouzdanu dijagnostiku
- Pomjeriti registraciju globalnih boot error handlera na sam vrh `main.tsx`, prije svega ostalog što može pasti.
- Ukloniti rizične statičke importe iz boot entry-ja:
  - ne importovati `db` u vrhu `main.tsx`
  - po potrebi lazy/dynamic import za `App`
  - backup listener vezan za `db` registrovati tek nakon uspješnog mounta ili kroz dynamic import unutar callbacka
- Time osiguravamo da čak i import-time greške postanu vidljive umjesto da ostanu “0% bez traga”.

4. Konkretne sumnjive tačke koje treba instrumentovati
- `src/lib/db.ts`
  - `new MemoriaDB()` na module scope
  - Dexie instanca može pasti prije React mounta
- `src/main.tsx`
  - statički import `App`
  - statički import `db`
  - timeout za splash nije koristan ako se fajl prekine prije njegovog izvršenja
- `src/contexts/AppContext.tsx`
  - `useGlobalPomodoro()` zove `loadAppSettings()` tokom rendera
  - `UIProvider` odmah koristi `useNavigate`, `useLocation`, notification scheduling i analytics side-effecte
- `src/components/TopNav.tsx`
  - inicijalni state čita `document.documentElement.classList.contains("dark")`
  - vjerovatno nije glavni uzrok, ali treba biti dio traga
- `src/views/DashboardPage.tsx`
  - `localStorage.getItem("sr-last-source-label")` u `useMemo` tokom prvog rendera

5. Plan implementacije
- Faza 1: dodati boot tracing util i splash debug status
  - centralni helper za `markBootStep(step, meta?)`
  - vizuelni prikaz posljednje faze na splashu
- Faza 2: ojačati entrypoint
  - error handlere registrovati prije ostalih import-zavisnosti
  - prebaciti `App` i `db` na guarded dynamic import putanju
- Faza 3: instrumentovati kritične faze
  - `main.tsx`
  - `useCards.ts`
  - `db.ts`
  - `AppContext.tsx`
  - `TopNav.tsx`
- Faza 4: napraviti “fatal boot report” ekran
  - prikazati:
    - posljednju uspješnu fazu
    - poruku greške
    - stack ako postoji
- Faza 5: smanjiti import-time rizik
  - gdje god je moguće, premjestiti browser-only pristup iz module scope / initial state u `useEffect` ili guarded helper

6. Očekivani ishod
- Umjesto “0% i ništa”, dobićemo jednu od dvije stvari:
  - splash će pokazati posljednju fazu prije zastoja
  - ili će se otvoriti fatal boot ekran sa stvarnom greškom
- To će nam omogućiti da precizno utvrdimo da li je problem:
  - Dexie/IndexedDB
  - import-time crash
  - router/provider mount
  - neki sync render koji baca grešku prije `useCards`

7. Tehnički detalji
```text
Sadašnji tok:
index.html -> src/main.tsx import App/db -> tek onda error handlers -> React render -> useCards -> splash 5%

Problem:
ako App/db import pukne prije handlera, splash ostaje 0%

Predloženi tok:
index.html -> minimal main bootstrap -> register handlers -> mark boot steps
-> dynamic import App
-> render App
-> useCards start
-> update splash/debug phase
```

8. Redosled rada
- Prvo: boot tracer + splash phase label
- Drugo: guarded/dynamic bootstrap u `main.tsx`
- Treće: uklanjanje `db` import-a iz top-level boota
- Četvrto: dodatna instrumentacija u `useCards`, `db`, `AppContext`
- Peto: analiza trace rezultata i onda ciljano popravljanje pravog uzroka

<lov-actions>
<lov-suggestion message="Test the startup flow end-to-end after adding boot tracing and confirm which exact phase the app reaches before it stalls.">Testiraj end-to-end</lov-suggestion>
<lov-suggestion message="Implement the boot tracing system with visible splash phase labels and a fatal boot report screen so we can identify the exact startup failure point.">Dodaj boot tracing</lov-suggestion>
<lov-suggestion message="Refactor main.tsx so global error handlers are registered before any risky imports, and load App and db through a guarded bootstrap path.">Ojačaj entrypoint</lov-suggestion>
<lov-suggestion message="Instrument Dexie and useCards initialization with precise step-by-step logs for database open, migration, and data loading phases.">Instrumentuj bazu i useCards</lov-suggestion>
<lov-suggestion message="Move browser-only reads like localStorage, document, and window access out of risky initial render paths into guarded helpers or effects where appropriate.">Smanji import-time rizik</lov-suggestion>
</lov-actions>
