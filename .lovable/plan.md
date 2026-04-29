## Cilj
Proširiti fix za blijed tekst (uklanjanje `dark:prose-invert` koji prebrisava globalna `.dark .prose` pravila iz `index.css`) na preostala 4 mjesta gdje se prikazuje sadržaj sekcija/kartica.

## Izmjene (jedan jednolinijski class fix po fajlu)

### 1. `src/components/subject-cards/PassiveReader.tsx` — linija 397
```diff
- className="prose prose-sm max-w-none dark:prose-invert card-prose"
+ className="prose prose-sm max-w-none card-prose"
```

### 2. `src/components/LinkToExistingCardModal.tsx` — linija 86
```diff
- className="text-xs prose prose-xs dark:prose-invert max-w-none card-prose line-clamp-4"
+ className="text-xs prose prose-xs max-w-none card-prose line-clamp-4"
```

### 3. `src/components/workshop/WorkshopCardItem.tsx` — linija 192
```diff
- <div className="text-sm prose prose-sm max-w-none dark:prose-invert card-prose" ... />
+ <div className="text-sm prose prose-sm max-w-none card-prose" ... />
```

### 4. `src/components/source-reader/EssayCreationDialog.tsx` — linija 42
```diff
- className="text-sm prose prose-sm dark:prose-invert max-w-none card-prose"
+ className="text-sm prose prose-sm max-w-none card-prose"
```

## Razlog
Globalna `.dark .prose` pravila u `index.css` već postavljaju `--tw-prose-body` na `hsl(var(--foreground))` pri punoj neprozirnosti. Dodavanje `dark:prose-invert` resetuje tu palatu na podrazumijevani `prose-invert` sivi ton (`#d1d5db`), što proizvodi efekat "duple opacity" i blijed tekst. Memorija (`mem://ui/styling-prose-fixes-v3`) već nalaže da prose body ostaje na `--foreground` pri punoj neprozirnosti u oba režima.

## Van opsega
- Promjene `index.css` — globalna pravila su već ispravna.
- Druge komponente koje ne koriste `dark:prose-invert`.