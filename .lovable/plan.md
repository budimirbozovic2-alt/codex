## Problem

Wiki linkovi (`[[Naslov]]`) u Zettelkastenu se prikazuju ali se **ne mogu kliknuti**. Uzrok je u sigurnosnom sloju:

`ZettelPreview` generiše svaki link kao `<button type="button" data-wiki="...">`, a zatim taj HTML prolazi kroz globalni `sanitizeHtml()` (`src/lib/sanitize.ts`) prije nego što se umetne u DOM. Globalni sanitizer ima striktnu allow-listu koja:

1. **NE dozvoljava `<button>` tag** — DOMPurify ga potpuno briše, ostaje samo tekst naslova bez klikabilnog elementa.
2. **NE dozvoljava `data-*` atribute** (`ALLOW_DATA_ATTR: false`) — pa i da je button ostao, `data-wiki` bi bio strippovan i handler u `handleClick` ne bi imao kako da pročita naslov.

Rezultat: tekst je samo običan stilizovani span bez ikakvog event targeta, klik ne radi ništa.

## Rješenje

Generisati linkove kao `<a>` tagove (koji **jesu** na allow-listi) i naslov prenijeti kroz `id` atribut (također dozvoljen), a ne kroz `data-*`. Naslov se base64-enkoduje u `id` da bude atributno bezbjedan (podržava ćirilicu, razmake, znakove interpunkcije), i dekoduje pri kliku.

Ne mijenjamo globalni `sanitize.ts` — XSS politika ostaje stroga svuda drugdje.

## Izmjene

**`src/components/zettelkasten/ZettelPreview.tsx`** — jedina datoteka koja se mijenja:

1. U `inline()` regex zamjeni za `[[...]]`:
   - Promijeniti emit sa `<button type="button" data-wiki="X" class="...">` na `<a id="wl-<base64(title)>" class="zettel-wikilink ...">`.
   - Zadržati postojeće tri varijante stila (populated / draft / missing) i dodati `cursor-pointer` jer `<a>` bez `href` po defaultu nema pointer cursor.

2. U `handleClick`:
   - Promijeniti selektor sa `button[data-wiki]` na `a.zettel-wikilink`.
   - Naslov dekodirati iz `id` atributa (skinuti prefix `wl-`, base64-decode).

3. Bez ikakvih izmjena u `ZettelkastenView.tsx`, `sanitize.ts`, niti u storage / wiki-link auto-create logici.

## Tehnički detalji

```ts
// Encoding (UTF-8 safe za ćirilicu/dijakritike):
const encoded = `wl-${btoa(unescape(encodeURIComponent(title))).replace(/=+$/, "")}`;
return `<a id="${encoded}" class="${cls}">${escapeHtml(title)}</a>`;

// Click handler:
const a = (e.target as HTMLElement).closest("a.zettel-wikilink") as HTMLAnchorElement | null;
if (a) {
  e.preventDefault();
  const enc = a.id.replace(/^wl-/, "");
  // base64 → utf-8
  const title = decodeURIComponent(escape(atob(enc + "=".repeat((4 - enc.length % 4) % 4))));
  if (title) onWikiLink(title);
}
```

## Verifikacija nakon implementacije

- Klik na plavi (postojeći) link otvara članak.
- Klik na sivi italic (draft placeholder) otvara članak u edit modu.
- Klik na amber (missing) link kreira novi placeholder i otvara ga.
- Linkovi sa ćiriličnim naslovima i razmacima rade ispravno.
