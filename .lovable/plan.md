## Cilj
LocalSpeedReader trenutno ima 4 useState + 4 useEffect koja ručno sinhronizuju filtere, validaciju protiv taksonomije, persist u localStorage, reset indeksa, i fokus na konkretnu karticu. To je klasičan "manual sync between sources" — filteri su rasuti, a `index` je derivat koji se "popravlja" efektima.

Refaktor uvodi **jedan reducer kao SSOT za filtere + indeks**, jedan persist effect, i jedan validation pass. Sve ostalo (chapters, filtered, current, stats) postaje čisti `useMemo` derivat.

## Plan

### 1. Novi hook: `src/hooks/speed-reader/useSpeedReaderSelection.ts`

SSOT za izbor kartice — drži `{subFilter, chapterFilter, typeFilter, index}` u jednom `useReducer`.

**Reducer akcije:**
- `SET_SUB` — postavi sub, resetuj chapter na "all", resetuj index na 0
- `SET_CHAPTER` — postavi chapter, resetuj index na 0
- `SET_TYPE` — postavi type, resetuj index na 0
- `RESET_ALL` — sve na "all", index 0
- `JUMP_TO` — postavi index (sa clamp)
- `NEXT` / `PREV` — clamp na granice
- `RECONCILE` — interno: kad se taksonomija ili filtrirana lista promijeni izvana, jedan poziv koji:
  - srušuje `subFilter` na "all" ako node više ne postoji
  - srušuje `chapterFilter` na "all" ako chapter više ne postoji u trenutnom sub
  - clamp-uje `index` u `[0, filteredLen-1]`

Sve invariante drži reducer, a ne efekti — eliminira race-eve između "validate" i "reset index" efekata.

**Hook potpis:**
```ts
useSpeedReaderSelection({
  cards, subcategoryNodes, categoryId, initialCardId, onInitialConsumed
}) → {
  subFilter, chapterFilter, typeFilter, index,
  chapters,           // useMemo iz subcategoryNodes + subFilter
  filtered,           // useMemo iz cards + filteri (sortirano)
  current,            // filtered[index]
  setSub, setChapter, setType, resetAll,
  jumpTo, next, prev,
}
```

**Efekti unutar hooka (samo 2, oba sa jasnim ulogama):**
- `useEffect` za persist u localStorage (debounce-free, samo write na promjenu trijade filtera)
- `useEffect` za `RECONCILE` koji se okida na promjenu `subcategoryNodes`, `cards.length`, ili kad `initialCardId` stigne — u njemu se i obrađuje `initialCardId` (pronađe karticu, resetuje filtere ako treba, postavi index, pozove `onInitialConsumed`).

**Initial state:** lazy init iz `loadFilters(categoryId)` jednom, bez tri pozivanja.

### 2. Novi hook: `src/hooks/speed-reader/useSpeedReaderEngine.ts`

Izolovati word-cursor + TTS engine od UI. Prima `current: Card | null` i konfiguraciju, vraća sve što `SpeedReaderControls` i word display trebaju.

**Vraća:**
```ts
{
  segments, wordEntries, totalWords, activeSegment, progress,
  currentWordIdx, playing, wpm, fontSize,
  ttsEnabled, ttsMode, ttsSettings, voices, showTtsSettings,
  setWpm, setFontSize, setTtsEnabled, setTtsMode,
  setTtsSettings: updateTtsSettings, setShowTtsSettings,
  jumpToWord, handlePlayPause, handleReset,
  handlePrevWord, handleNextWord, stopTts,
  registerWordRef,   // (idx, el) => void  — zamjena za wordRefs.current[idx] = el
}
```

`currentWordIdx` reset na `current?.id` ostaje **u hook-u**, ali jedini efekt koji to radi (umjesto dva razasuta).

`ttsMode` persist se radi unutar `setTtsMode` (single-writer), ne kroz useEffect mirror.

### 3. `LocalSpeedReader.tsx` postaje "dumb"

Cijela logika svodi se na:
```tsx
const sel = useSpeedReaderSelection({ cards, subcategoryNodes, categoryId, initialCardId, onInitialConsumed });
const eng = useSpeedReaderEngine(sel.current);
const stats = useMemo(() => computeStats(sel.current), [sel.current]);

useGlobalHotkey(...);  // ostaje, ali poziva eng.handlePlayPause itd.

return ( <Filters .../> <Controls .../> <WordDisplay .../> <Pager .../> );
```

Nema više `useState` u komponenti, nema `useEffect` u komponenti. Sva derived stanja (`chapters`, `filtered`, `current`, `segments`, `progress`, `activeSegment`, `stats`) su `useMemo` u hooku ili lokalno — niti jedan se više ne "sinhronizuje" preko `setState` u efektu.

`computeStats` se izvlači u običnu funkciju u istom fajlu (čista, bez React-a).

### 4. Pomoćne sitnice

- `loadFilters` se premješta u `useSpeedReaderSelection.ts` (jedini consumer).
- `retentionColor` se izdvaja u `src/components/speed-reader/retention-color.ts` (čisti util, koristiće ga i drugi reader-i kasnije).
- `wordRefs` ostaje ref u hooku, ali se izlaže preko `registerWordRef` callback-a — komponenta ne drži ref array sama.

### 5. Verifikacija

- Pokrenuti `bunx vitest run` (ne postoje speed-reader testovi, ali okolni ne smiju puknuti).
- Ručna provjera u preview-u: filteri se i dalje persist-uju, brisanje potkategorije ne ostavlja "zombi" filter, klik na "Prethodna/Sljedeća" radi, `initialCardId` (ulazak iz CardList) i dalje skače na traženu karticu i resetuje filtere ako je sakrivena.

## Tehnički detalji

**Datoteke:**
- `src/hooks/speed-reader/useSpeedReaderSelection.ts` (novo, ~140 linija)
- `src/hooks/speed-reader/useSpeedReaderEngine.ts` (novo, ~180 linija)
- `src/components/speed-reader/retention-color.ts` (novo, ~6 linija)
- `src/components/subject-cards/LocalSpeedReader.tsx` (refaktor, ~200 linija → samo JSX + 2 hook poziva)

**SSOT garancije nakon refaktora:**
- Filteri: jedan reducer state, jedan persist effect, jedan reconcile effect.
- Index: dio istog reducer-a, ne može desync-ovati od filtera.
- Word cursor: jedan `useState` resetovan u jednom effect-u u engine hook-u.
- localStorage je sink, ne izvor — čita se samo na mount (lazy init).

**Ocjene poslije refaktora:** SSOT: A, SOA: A, UI vs Logic: A.

**Ne mijenja se:**
- `SpeedReaderControls` props.
- Vizualni izgled, klase, ponašanje skrolovanja, hotkey-i.
- `buildSegments`, `cleanForTTS`, TTS algoritam (samo selidba).
