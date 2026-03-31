

# Sljedeća faza: Čišćenje preostalih legacy referenci + DnD stabilizacija

## Rezime
Ostalo je nekoliko konkretnih problema nakon dosadašnjih refaktora:

1. **Form save ne šalje ispravna polja** — `useCardActions.ts` šalje `{ category, subcategory, chapter }` u `onUpdate`, ali `updateCard` u CRUD-u očekuje `{ categoryId, subcategoryId, chapterId }`. Rezultat: izmjena kategorije/potkategorije/glave kroz formu se **tiho gubi**.

2. **CardOrgMode.tsx L468** — još uvijek piše `subcategory: targetSub` (obrisano polje) uz `subcategoryId: targetSub`.

3. **DnD portal stabilizacija** — `CardOrgMode.tsx` i `MentalSkeleton.tsx` oba koriste `createPortal(DragOverlay, document.body)`. Sa Zustand store-om za SourceReader već na mjestu, DnD bi trebao biti stabilniji, ali treba dodati `useMemo` za `sensors` u `CardOrgMode` (trenutno ih nema) i memoizirati `measuring` config objekt da se spriječi re-kreiranje pri svakom renderu.

4. **Memoizacija audit** — `CardOrgMode.tsx L243` koristi `useMemo` sa side-effect-om (`setExpandedSubs`) — to je React anti-pattern koji može izazvati nepredvidive renderove.

---

## Promjene po fajlovima

### 1. `src/hooks/useCardActions.ts` (~15 linija)

**Problem**: `onUpdate` interfejs koristi `category`, `subcategory`, `chapter` ali CRUD očekuje `categoryId`, `subcategoryId`, `chapterId`.

- L22-28: Preimenuj polja u `onUpdate` interfejsu na `categoryId?`, `subcategoryId?`, `chapterId?`
- L196-200: `resolvedMeta` preimenuj ključeve u `categoryId`, `subcategoryId`, `chapterId`
- L221-231: Proslijedi nova imena u `onUpdate` pozive

### 2. `src/components/CardForm.tsx` (~5 linija)

- Ažuriraj `onUpdate` prop interfejs da koristi `categoryId`, `subcategoryId`, `chapterId`
- Proslijedi ispravna polja iz `useCardActions` returna

### 3. `src/components/category/CardOrgMode.tsx` (~10 linija)

- **L268**: Ukloni `chapter: chapter || undefined` — ostavi samo `chapterId`
- **L468**: Ukloni `subcategory: targetSub` — ostavi samo `subcategoryId: targetSub`
- **L243**: Zamijeni `useMemo` sa side-effectom sa `useEffect` — ispravka React anti-patterna
- Dodaj `useSensors` / `useSensor(PointerSensor)` za DnD (trenutno nema sensor konfiguraciju, koristi default)

### 4. `src/views/EditPage.tsx` (~2 linije)

- L33: `handleUpdate` tip se automatski usklađuje jer `Partial<Card>` već ima `categoryId`/`subcategoryId`/`chapterId`

---

## Tehnički detalji

```text
useCardActions.ts (form) ──onUpdate──> EditPage.tsx ──updateCard──> useCardCRUD.ts (CRUD)
                                         
PRIJE: { category, subcategory, chapter }  →  ignoriše ih jer čeka categoryId/subcategoryId/chapterId
POSLIJE: { categoryId, subcategoryId, chapterId }  →  ispravno mapira
```

## Fajlovi

| Fajl | Promjena | Linija |
|------|----------|--------|
| `src/hooks/useCardActions.ts` | Preimenuj polja u onUpdate interfejsu i resolvedMeta | ~15 |
| `src/components/CardForm.tsx` | Uskladi onUpdate prop tip | ~5 |
| `src/components/category/CardOrgMode.tsx` | Ukloni legacy polja, fix useMemo anti-pattern, dodaj sensors | ~10 |
| `src/views/EditPage.tsx` | Verifikuj tip kompatibilnost (vjerovatno 0 promjena) | ~0 |

## Guardrails
- FSRS logika: netaknuta
- CSS/styling: bez promjena
- Nema novih zavisnosti
- Nema schema promjena

## Scope
- 3-4 fajla, ~30 linija promjena
- Kritični bugfix: form edit čuva kategoriju/potkategoriju/glavu

