## Problem

Kada se otvori "Aktivno učenje" (posebno preko strict-recall linka iz Dashboarda/Risk widgeta), `readCount` jedne kartice raste u beskraj — hiljade puta i nastavlja rasti svake sekunde. Identifikovan je tačan uzrok: feedback petlja između `SessionContext` → `LearnPage.handleMarkRead` → `StudyModeRecall` useEffect.

### Lanac petlje (potvrđen čitanjem koda)

1. `src/contexts/SessionContext.tsx` (l. 135–145): `value` se memoizuje, ali u dependency listi je `queueSize`. Svaki `queueMarkRead` poziva `setQueueSize(prev+1)` → nova `value` referenca → svi konzumenti `useSessionContext()` re-renderuju.
2. `src/views/LearnPage.tsx` (l. 42–45): `handleMarkRead = useCallback(..., [session, markRead])` — pošto `session` mijenja identitet na svaki queue, `handleMarkRead` postaje nova funkcija nakon svakog poziva.
3. `src/components/learn/StudyModeRecall.tsx` (l. 52–57):
   ```ts
   useEffect(() => {
     setArPhase(strictRecall ? "drill" : "preview");
     setDrillIndex(0);
     setDrillRevealed(false);
     if (strictRecall) onMarkRead(card.id);
   }, [card.id, strictRecall, onMarkRead]);
   ```
   `onMarkRead` u dep listi — kako se mijenja na svaki tik, efekat se ponovo izvršava → `onMarkRead(card.id)` → `queueMarkRead` + `markRead` (incrementuje `readCount` i pravi novu `cards` referencu) → ponovo render → nova `handleMarkRead` → efekat opet → ∞.

Rezultat: `readCount` raste neograničeno, `queueSize` raste neograničeno, IndexedDB persist queue se nadima, UI postaje sve sporiji.

## Rješenje

Dvije male, ciljane izmjene koje uklanjaju petlju bez promjene ponašanja:

### 1. `src/components/learn/StudyModeRecall.tsx`
Razdvojiti efekat reset-stanja od markRead poziva, i pozvati markRead samo jednom po kartici preko `useRef` čuvara:

```ts
// Reset state when card changes
useEffect(() => {
  setArPhase(strictRecall ? "drill" : "preview");
  setDrillIndex(0);
  setDrillRevealed(false);
}, [card.id, strictRecall]);

// Strict-recall: mark read EXACTLY ONCE per card
const markedRef = useRef<string | null>(null);
useEffect(() => {
  if (!strictRecall) return;
  if (markedRef.current === card.id) return;
  markedRef.current = card.id;
  onMarkRead(card.id);
  // namjerno bez onMarkRead u depu — guard ref garantuje single-fire
}, [card.id, strictRecall]); // eslint-disable-line react-hooks/exhaustive-deps
```

### 2. `src/views/LearnPage.tsx`
Stabilizovati `handleMarkRead` (i `handleReviewSection`) tako da im identitet ne ovisi o nestabilnoj `session` referenci. Koristimo `useRef` na trenutnu sesiju:

```ts
const sessionRef = useRef(session);
useEffect(() => { sessionRef.current = session; }, [session]);

const handleMarkRead = useCallback((id: string) => {
  if (sessionRef.current.isSessionActive) sessionRef.current.queueMarkRead(id);
  markRead(id);
}, [markRead]);

const handleReviewSection = useCallback((cardId: string, sectionId: string, grade: number) => {
  if (sessionRef.current.isSessionActive) sessionRef.current.queueReview(cardId, sectionId, grade);
  reviewSection(cardId, sectionId, grade);
}, [reviewSection]);
```

Ovo i samostalno raskida petlju, ali fix #1 je primarni — guard ref u `StudyModeRecall` čini sistem otpornim i na buduće slične regresije.

### 3. (Opciono, low risk) Zaštita u `useCardAnnotations.markRead`
Dodati throttle sigurnosnu mrežu — npr. ignorisati uzastopne pozive za isti `cardId` u prozoru od 250 ms. Ovo je defenzivno; nije nužno ako se primijene #1 i #2, ali sprječava buduće regresije iz drugih konzumenata. Predlažem da ga **preskočimo** u prvom prolazu da ne maskiramo prave bug-ove.

## Šta NE mijenjamo

- `SessionContext` ostaje kakav jeste (queueSize mora trigerovati re-render za UI badge "X u queue").
- `StudyModeFree` već zove `markRead` samo iz korisničkog handlera (l. 54–56), nije zahvaćen.
- Logika strict-recall flow-a (drill, gradiranje) ostaje identična.

## Fajlovi

- `src/components/learn/StudyModeRecall.tsx` — razdvojiti efekat + uvesti `markedRef` guard
- `src/views/LearnPage.tsx` — stabilizovati `handleMarkRead` i `handleReviewSection` preko `sessionRef`

## Verifikacija nakon implementacije

1. Otvoriti Risk widget → Strict-recall za jednu karticu → otvoriti DevTools → provjeriti da `readCount` u IndexedDB poraste tačno za 1 kada se uđe u karticu i da ne raste dok se ne pređe na sljedeću.
2. Pratiti `queueSize` u session badge-u — raste samo na stvarne korisničke akcije.
3. Provjeriti da Free i Chain modovi i dalje rade normalno (oni ne zavise od strict-recall granu).
