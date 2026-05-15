## Cilj

Dodati realističan e2e test koji simulira **puni tok uvoza kartica** (upload datoteke → dijalog potvrde → close) i verificira da `body-pointer-events-guard` oslobađa `pointer-events: none` na `<body>` čim se Radix dijalog zatvori, tako da pozadinska UI ostaje klikabilna.

## Novi fajl

`src/test/card-import-flow-e2e.test.tsx`

## Scenariji (3 testa)

1. **Uvoz iz fajla → dijalog potvrde → close → klik prolazi**
   - Harness komponenta: `<input type="file">` + Radix `Dialog` koji se otvara `onChange`-om i prikazuje "Potvrdi uvoz" / "Odustani".
   - Simulira `userEvent.upload()` sa fake `.json` fajlom (mock kartica).
   - Klik na "Potvrdi uvoz" → `onOpenChange(false)` + ručno postavlja `document.body.style.pointerEvents = 'none'` (mimika Radix leak-a).
   - `await nextRaf()` → guard detektuje da nema otvorenog overlay-a i čisti `pointerEvents`.
   - Klik na pozadinski "Nova kartica" dugme registruje se (`expect(handler).toHaveBeenCalled()`).

2. **Uvoz više kartica (bulk) → toast → close → klik prolazi**
   - Isti harness, ali `Dialog` sa "Uvezeno N kartica" porukom.
   - Zatvori preko `Escape` tipke (`userEvent.keyboard('{Escape}')`).
   - Verifikuje da nakon `nextRaf()` `body.style.pointerEvents === ''` i da je pozadinski klik moguć.

3. **Kreacija single kartice → save → close → klik prolazi**
   - Harness sa "Nova kartica" dugmetom koji otvara Dialog sa formom.
   - `userEvent.type()` u input → klik "Sačuvaj" → dijalog se zatvori.
   - Verifikuje guard cleanup i klik na "Lista kartica" dugme u pozadini.

## Tehnički detalji

- Koristi pravi `@radix-ui/react-dialog` (već u projektu) za autentičan lifecycle.
- `installBodyPointerEventsGuard()` se poziva u `beforeEach`, `dispose()` u `afterEach`.
- `nextRaf()` helper: `await new Promise(r => requestAnimationFrame(() => r(null)))`.
- `cleanup()` iz `@testing-library/react` u `afterEach`.
- Bez izmjena u produkcijskom kodu — samo novi test fajl.

## Verifikacija

`bunx vitest run src/test/card-import-flow-e2e.test.tsx` — sva 3 testa moraju proći.
