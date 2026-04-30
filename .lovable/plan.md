## Cilj

Na stranici **Dijagnostika predmeta** (`/subject/:categoryId/diagnostics`) dodati uz svaku metriku jasno objašnjenje:
- **Šta** se mjeri,
- **Kako** se računa (formula / prag),
- **Koji podaci** su konkretno korišćeni za TAJ predmet (broj kartica, broj review zapisa, broj kalibracija, broj latencija itd.).

Cilj je da korisnik razumije zašto vidi određeni rezultat i da odmah vidi je li uzorak dovoljno velik za pouzdan zaključak.

## Pristup

Iskoristićemo postojeći `InfoPanel` komponentu (već postoji `src/components/InfoPanel.tsx` — popover sa "Info" trigerom). Svakoj metrici u `CognitiveAnalytics.tsx` dodajemo `InfoPanel` u zaglavlju kartice (pored `label`-a) sa:
1. Kratkim opisom svrhe,
2. Formulom / pragom računanja,
3. Live "Korišćeni podaci za ovaj predmet" sekcijom — brojevi se računaju iz već prosljeđenih `cards` i `reviewLog` (oba su već scope-ovana po `categoryId` u `SubjectDiagnosticsPage`).

Takođe, u `SubjectDiagnosticsPage.tsx` dodajemo na vrh stranice kratki **kontekstualni summary** ("Analiza je bazirana na X kartica i Y ponavljanja iz ovog predmeta") da korisnik odmah zna obim podataka.

## Konkretne izmjene

### 1. `src/components/CognitiveAnalytics.tsx`
- Modifikovati `LazyChart` upotrebu tako da `label` može sadržati `InfoPanel` (ili obmotati svaku metriku u wrapper koji prikazuje `label + InfoPanel` zajedno). Najjednostavnije: dodati novi opcionalni `info?: ReactNode` prop na `LazyChart`, ili ekstrahovati lokalni helper `MetricSection` koji prikazuje header (ikona + label + info popover) iznad `LazyChart`-a.
- Pripremiti pomoćne brojače jednom (memo): `cardsCount`, `cardsWithErrorsCount`, `totalErrorEntries`, `sectionsWithReviewCount`, `reviewLogCount`, `latencyLogCount`, `calibrationCount`, `disciplineLogCount`. Globalne logove (`loadLatency`, `loadCalibration`, `loadDisciplineLog`) učitati lokalno samo radi prikaza brojača — ne mijenja se logika računanja.

Za svaku od 7 metrika dodati objašnjenje:

**Indeks interferencije**
- Šta: parovi kartica iz iste (pod)kategorije gdje se ponavljaju iste tipične greške.
- Kako: skor = `min(100, sharedErrorPrefixes·30 + questionWordOverlap·70)`, prag prikaza ≥ 20.
- Korišćeni podaci: broj aktivnih (ne "mastered") greški po karticama predmeta.

**Stabilnost memorije**
- Šta: prosječna FSRS `stability` i trenutna `retrievability` po (pod)kategoriji.
- Kako: `R = exp(-elapsedDana / stability)`. "Kritična" cjelina = procijenjena R < 0.85 na datum ispita iz Strateškog plana.
- Korišćeni podaci: broj sekcija sa `lastReviewed`, datum cilja iz plannera (ako postoji).

**Otpornost na stres**
- Šta: poređenje prosječne ocjene u "brzim" (stresnim) vs. "normalnim" odgovorima.
- Kako: prag stresa = 50% prosječne latencije; `otpornost = max(0, (1 - drop/3)·100)`. Minimum: 5 normalnih + 3 stresna odgovora.
- Korišćeni podaci: broj zapisa latencije ukupno (napomena da se latencija loguje globalno; metrika koristi sve tvoje latencije, ali samo one čiji review se odnosi na karticu ovog predmeta).

**Slijepe tačke**
- Šta: kartice u kojima je samoprocjena sigurnosti bila visoka (≥4/5) a stvarna ocjena niska (≤2/4).
- Kako: agregirano iz `calibration` zapisa, filtrirano na kartice ovog predmeta.
- Korišćeni podaci: broj kalibracijskih zapisa za kartice predmeta.

(Metrike "Analiza frikcije", "Indeks oporavka" i "Slabe kuke" su već skrivene u scoped pogledu — nije potrebno objašnjenje.)

### 2. `src/views/SubjectDiagnosticsPage.tsx`
- Dodati ispod naslova mali "data scope" red koji prikazuje:
  - broj kartica ovog predmeta,
  - broj sekcija sa istorijom ponavljanja,
  - broj review zapisa,
  - broj zabilježenih grešaka.
- Tekst: "Sve metrike ispod računaju se isključivo iz ovih podataka."

### 3. (opcionalno) `src/components/InfoPanel.tsx`
- Trenutno popover ide `right-0 top-8`. Ako postane premali za detaljnije objašnjenje, proširiti na `w-96`. Bez funkcionalnih izmjena.

## Pseudokod prikaza po metrici

```tsx
<MetricHeader
  icon={<AlertTriangle … />}
  label="Indeks interferencije"
  info={
    <InfoPanel title="Indeks interferencije">
      <p><b>Šta mjeri:</b> parove kartica iz istog predmeta gdje se ponavljaju slične greške…</p>
      <p><b>Formula:</b> skor = min(100, sharedErrors·30 + qSimilarity·70), prag ≥ 20.</p>
      <p><b>Korišćeni podaci za ovaj predmet:</b></p>
      <ul>
        <li>{cardsCount} kartica</li>
        <li>{cardsWithErrorsCount} sa zabilježenim greškama</li>
        <li>{activeErrorEntries} aktivnih grešaka</li>
      </ul>
    </InfoPanel>
  }
/>
<LazyChart … />
```

## Fajlovi koje mijenjamo
- **Modifikuje se:** `src/components/CognitiveAnalytics.tsx` (glavni rad).
- **Modifikuje se:** `src/views/SubjectDiagnosticsPage.tsx` (data-scope summary u headeru).
- **Mogući manji tweak:** `src/components/InfoPanel.tsx` (širina popovera, bez funkcionalne promjene).
- **Bez promjena:** logika u `src/lib/analytics/*` ostaje netaknuta — samo se prikazuje šta već radi.

## Šta NE radimo
- Ne mijenjamo formule ni pragove (samo ih dokumentujemo).
- Ne dodajemo nove metrike.
- Ne diramo `FrequentErrors` blok (već je samoobjašnjavajući kroz legende i statuse).
