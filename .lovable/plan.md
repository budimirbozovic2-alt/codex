## Cilj

Eliminisati jedini preostali rogue pattern (lokalna `useState<Source[]>` kopija sa one-shot load, bez subscription) u `src/views/ZettelkastenView.tsx` i uskladiti sa `mem://technical-choices/ssot-storage-listeners`.

## Promjene (samo 1 fajl)

`src/views/ZettelkastenView.tsx`:

1. **Ukloniti** import `loadSourcesByCategory` iz `@/lib/sources-storage` (zadržati `type Source`).
2. **Dodati** import: `import { useCategorySources } from "@/hooks/useCategorySources";`
3. **Ukloniti** `const [sources, setSources] = useState<Source[]>([]);` (linija 61).
4. **Dodati** ispod `categoryRec`: `const sources = useCategorySources(categoryId);`
5. **Refaktorisati** `useEffect` (linije 95-124):
   - Skinuti `loadSourcesByCategory(categoryId)` iz `Promise.all`.
   - Ukloniti `setSources(srcs)`.
   - Effect učitava SAMO articles + ensure index.

```ts
useEffect(() => {
  if (!categoryId || !categoryRec) return;
  let cancelled = false;
  setLoading(true);
  loadArticlesBySubject(categoryId).then(async (list) => {
    if (cancelled) return;
    const suggested = (categoryRec.subcategories ?? []).map(s => s.name);
    const idx = await ensureIndexArticle(categoryId, categoryRec.name, suggested);
    if (cancelled) return;
    const merged = list.some(a => a.id === idx.id)
      ? list.map(a => a.id === idx.id ? idx : a)
      : [idx, ...list];
    setArticles(merged);
    backlinkIndex.rebuildFromAll(categoryId, merged);
    setActiveId(prev => prev ?? idx.id);
    setLoading(false);
  });
  return () => { cancelled = true; };
}, [categoryId, categoryRec]);
```

## Posljedice

- `LinkedSourcesPicker` (`allSources={sources}`) i `readingSource` lookup automatski reagujou na `saveSource`/`deleteSource` iz bilo koje druge komponente (SourcesTab, SourceEditor, SmartSplit, AutoLink).
- Nema novih providera, nema arhitektonske izmjene — samo poštovanje postojećeg SSoT ugovora.
- Zero risk: hook je već u produkciji (`GlobalSearch` itd.).

## Bez akcije

Ostalih ~20 fajlova je već compliant — ne diram ih.
