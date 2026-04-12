
Plan: riješiti zašto se “useRef is not defined” stalno pojavljuje za Memo radionicu

## Šta sam utvrdio
- U trenutnom kodu ne vidim aktivan missing-import problem u Mnemo dijelu:
  - `src/components/MnemonicWorkshop.tsx` koristi i importuje `useRef`
  - `src/components/MnemonicTest.tsx` koristi i importuje `useRef`
  - `src/components/TextSelectionTooltip.tsx` koristi i importuje `useRef`
- `src/components/MnemonicModule.tsx` čak importuje `useRef`, ali ga trenutno uopšte ne koristi.
- U trenutnim runtime/console podacima nema aktivne greške `useRef is not defined`.

## Najvjerovatniji uzrok
Ovo trenutno više liči na stari crash zapis nego na aktivan bug.

Zašto:
- `src/components/ErrorBoundary.tsx` svaki pad sprema u `localStorage` pod `codex-crash-log`
- `src/components/HealthMonitor.tsx` taj log samo učitava i prikazuje dok se ručno ne obriše
- nema automatskog isteka, deduplikacije ni oznake da je zapis “historijski”

Znači: vrlo je moguće da je Mnemo ruta nekad ranije stvarno padala sa `useRef is not defined`, ali taj zapis i dalje ostaje vidljiv u aplikaciji iako trenutni kod više nema taj problem.

## Do I know what the issue is?
Da. Najvjerovatnije su u pitanju 2 povezana problema:
1. stariji build ili stari cache je nekad izazvao pravi Mnemo crash,
2. taj crash je ostao trajno sačuvan u crash logu, pa sada izgleda kao da je greška i dalje aktivna.

## Plan implementacije nakon odobrenja

### 1) Potvrditi da li je greška još živa ili je samo historijski zapis
- Otvoriti `/mnemonics`
- Proći:
  - početni ekran
  - Radionicu
  - Testiranje
  - Mentalne tablice
- Ako se ne reprodukuje: tretirati problem kao stale crash log
- Ako se reprodukuje samo na published verziji: tretirati kao cache/build problem

### 2) Popraviti logovanje da isti crash ne zatrpava aplikaciju
**Fajl:** `src/components/ErrorBoundary.tsx`
- deduplikovati iste greške po `label + message`
- umjesto gomilanja skoro istih unosa čuvati:
  - `count`
  - `firstSeen`
  - `lastSeen`
- po potrebi dodati i oznaku build-a/verzije da se vidi iz koje verzije je zapis

### 3) Popraviti prikaz Error Log-a da razlikuje stare i aktuelne probleme
**Fajl:** `src/components/HealthMonitor.tsx`
- grupisati identične greške
- prikazati broj ponavljanja i “zadnji put viđeno”
- dodati jasnu opciju za:
  - brisanje starih/historijskih zapisa
  - ili potpuno čišćenje crash loga

### 4) Ako se bug ipak reprodukuje uživo, onda riješiti cache/build uzrok
**Fajlovi za provjeru/fix:**
- `public/sw.js`
- `src/main.tsx`
- Mnemo route komponente
- osigurati da published aplikacija povlači svježi bundle za `/mnemonics`
- po potrebi bumpovati cache/version da stari Mnemo bundle ne ostaje aktivan

## Očekivani rezultat
- ako je bug već popravljen: Error Log više neće stalno prikazivati staru Mnemo grešku
- ako bug postoji samo u objavljenoj verziji: izolovaćemo da je problem cache/build, ne trenutni source kod
- budući crash log će biti mnogo tačniji i korisniji za dijagnostiku

## Scope
- glavni fix: `src/components/ErrorBoundary.tsx` + `src/components/HealthMonitor.tsx`
- dodatni fix samo ako se potvrdi aktivna reprodukcija: `public/sw.js` i/ili `src/main.tsx`
