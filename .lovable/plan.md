## Problem

U `src/components/category/CardViewTable.tsx` (linija 166) expanded prikaz sekcije koristi:

```html
<div className="text-xs prose prose-xs dark:prose-invert max-w-none line-clamp-4 card-prose" ...>
```

`dark:prose-invert` postavlja Tailwind-ovu paletu (`--tw-prose-body: #d1d5db` itd.) **nakon** našeg globalnog overrida u `src/index.css` (`.dark .prose { --tw-prose-body: hsl(var(--foreground)); ... }`). Posljedica: u dark modu tekst dobije bledu `prose-invert` boju umjesto pune `--foreground` koju zahtijeva Core memorija ("Prose body uses `--foreground` at full opacity in both light and dark; never compose `text-foreground/N` over `prose`.").

To je upravo "dupla primjena opacity-ja" o kojoj govoriš — efektivno se naš token override poništava.

## Rješenje

Ukloniti `dark:prose-invert` sa tog jednog elementa. Globalni `.dark .prose` blok u `index.css` već postavlja **sve** potrebne `--tw-prose-*` varijable za dark mod sa `hsl(var(--foreground))`, pa Tailwind utility više nije potreban i samo šteti. Light mode ostaje netaknut (`.prose` blok u `index.css` već pokriva i njega).

Nema potrebe ni za promjenom CSS-a, ni za novim klasama.

### Izmjena (jedna linija)

`src/components/category/CardViewTable.tsx:166`

```diff
- <div className="text-xs prose prose-xs dark:prose-invert max-w-none line-clamp-4 card-prose" ... />
+ <div className="text-xs prose prose-xs max-w-none line-clamp-4 card-prose" ... />
```

## Van opsega

Iste pattern (`prose ... dark:prose-invert ... card-prose`) postoji i u:
- `src/components/workshop/WorkshopCardItem.tsx:192`
- `src/components/LinkToExistingCardModal.tsx:86`
- `src/components/subject-cards/PassiveReader.tsx:378`
- `src/components/source-reader/EssayCreationDialog.tsx:42`

Korisnikov zahtjev je eksplicitno za **CardViewTable expanded prikaz**, pa ostala mjesta ostavljam netaknuta. Mogu da ih popravim u zasebnom koraku ako želiš da se primijeni isti fix svuda (preporučujem).

## Fajlovi

- **Izmijenjeno:** `src/components/category/CardViewTable.tsx` (uklonjen `dark:prose-invert` na linijama sekcijskog `prose` divaa).