

# Hronološko učenje — potpuni sort po hijerarhiji predmeta

## Problem
Trenutno hronološki sort u LearnSession:
1. Koristi `chapterPositionMap` koji se učitava iz zastarjelog IDB ključa (`chapters-{cat}-{sub}`) — odvojeno od kanonskog izvora (`CategoryRecord.subcategories[].chapters`)
2. Kad je odabrana samo kategorija (bez podkategorije), `chapterPositionMap` je prazan → kartice se sortiraju samo po `chapterOrder` i `createdAt`
3. **Nedostaje sort po poziciji podkategorije** (`SubcategoryNode.sortOrder`) — kartice iz različitih podkategorija se miješaju

## Rješenje
Zamijeniti učitavanje iz IDB ključa sa derivacijom pozicija direktno iz `categoryRecords` (koji su već dostupni kao prop).

### Novi sort algoritam (4 nivoa):
```text
1. subcategoryPosition  (SubcategoryNode.sortOrder)
2. chapterPosition      (index u SubcategoryNode.chapters[])
3. chapterOrder          (pozicija kartice unutar glave)
4. createdAt             (tiebreaker)
```

### Promjene u `LearnSession.tsx`
- **Ukloniti**: `chapterPositionMap` state, `dbModuleRef`, cijeli `useEffect` za učitavanje iz IDB (L41-66, ~25 linija)
- **Dodati**: `useMemo` koji iz `categoryRecords` gradi mapu pozicija:
  ```ts
  const positionMaps = useMemo(() => {
    const subPos: Record<string, number> = {};
    const chapPos: Record<string, number> = {};
    const catRec = categoryRecords.find(r => r.id === selectedCategory);
    if (!catRec) return { subPos, chapPos };
    for (const node of catRec.subcategories as SubcategoryNode[]) {
      subPos[node.name] = node.sortOrder;
      node.chapters.forEach((ch, i) => { chapPos[ch] = i; });
    }
    return { subPos, chapPos };
  }, [categoryRecords, selectedCategory]);
  ```
- **Ažurirati** `sortedCards` default case:
  ```ts
  default: {
    const { subPos, chapPos } = positionMaps;
    return filtered.sort((a, b) =>
      (subPos[a.subcategory ?? ""] ?? 999) - (subPos[b.subcategory ?? ""] ?? 999)
      || (chapPos[a.chapter ?? ""] ?? 999) - (chapPos[b.chapter ?? ""] ?? 999)
      || (a.chapterOrder ?? 0) - (b.chapterOrder ?? 0)
      || a.createdAt - b.createdAt
    );
  }
  ```

### Rezultat
- Kartice prate tačan vizuelni redoslijed iz Mape znanja / Mentalnog kostura
- Radi ispravno i kad je odabrana samo kategorija, i kad je odabrana podkategorija
- Uklonjena zavisnost na zastarjeli IDB ključ

## Scope
- 1 fajl (`LearnSession.tsx`), ~20 linija promijenjeno
- Bez novih zavisnosti, bez IDB promjena

