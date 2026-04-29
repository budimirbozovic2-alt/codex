## Dijagnoza

Tekst u karticama se ponekad prikazuje izrazito blijedo zbog **kompozicije više slojeva providnosti** koja se akumulira:

1. **`CardViewTable.tsx:166`** — kontejner za section.content kombinuje `text-foreground/70` + `prose` + `dark:prose-invert` + `card-prose`. U dark modu prose body već koristi `hsl(var(--foreground) / 0.9)` (`index.css:619`), pa goli tekst trpi 0.7 × 0.9 ≈ 63% opaciteta. Dijelovi unutar `<p>` dobijaju 0.9, a dijelovi van njega 0.7 — odatle **nejednako blijed tekst unutar iste kartice**.

2. **Inline color stilovi iz importovanog HTML-a** (Mammoth/DOCX, copy-paste iz Worda). Override `color !important` na `index.css:638-649` postoji **samo za `.dark .prose`**. U light modu ostaje siva boja iz dokumenta; van klase `.prose` override se uopšte ne primjenjuje.

3. **`--tw-prose-body` u light modu nije eksplicitno postavljen** — default Tailwind Typography vrijednost (`#374151`) ne dolazi iz dizajn-tokena, pa može vizuelno odudarati od ostatka teksta koji koristi `--foreground`.

## Izmjene

### `src/components/category/CardViewTable.tsx` (1 linija)
Ukloniti `text-foreground/70` sa kontejnera. Boja teksta treba da dolazi isključivo iz `prose` varijabli koje su već pravilno definisane u `index.css`. Ovo eliminiše dvostruki opacity i nejednakost između `<p>` i ostalog sadržaja.

```tsx
// prije:
className="text-xs text-foreground/70 prose prose-xs dark:prose-invert max-w-none line-clamp-4 card-prose"
// poslije:
className="text-xs prose prose-xs dark:prose-invert max-w-none line-clamp-4 card-prose"
```

### `src/index.css` — dodati light-mode prose blok i light-mode override za inline boje

Dodati prije postojećeg `.dark .prose` bloka (oko linije 617):

```css
/* ─── Prose light mode: anchor body text to design tokens ─── */
.prose {
  --tw-prose-body: hsl(var(--foreground));
  --tw-prose-headings: hsl(var(--foreground));
  --tw-prose-bold: hsl(var(--foreground));
  --tw-prose-links: hsl(var(--primary));
  --tw-prose-quotes: hsl(var(--foreground));
  --tw-prose-code: hsl(var(--foreground));
}

/* Force override inline color styles in light mode too (Mammoth/DOCX import) */
.prose [style*="color"],
.prose span[style],
.prose p[style],
.prose div[style],
.prose td[style],
.prose th[style],
.whitespace-pre-wrap [style*="color"],
.whitespace-pre-wrap span[style],
.whitespace-pre-wrap p[style] {
  color: hsl(var(--foreground)) !important;
}

.prose [style*="background-color"],
.whitespace-pre-wrap [style*="background-color"] {
  background-color: transparent !important;
}
```

I dodatno ojačati dark blok da bude **puno opaciteta** umjesto 0.9 (na liniji 619, 621, 627, 631):
```css
--tw-prose-body: hsl(var(--foreground));
--tw-prose-lead: hsl(var(--foreground) / 0.85);
--tw-prose-quotes: hsl(var(--foreground));
--tw-prose-pre-code: hsl(var(--foreground));
```

Razlog: `--foreground` je već dizajniran sa pravim kontrastom za pozadinu — dodatni opacity samo razbija WCAG kontrast koji je dizajn token već garantovao.

## Šta NE diramo

- `text-muted-foreground` ostaje gdje je namjerno korišten (timestamps, sekundarne labele, prazno-state poruke). To je legitimna sekundarna hijerarhija.
- `text-foreground/70` u svrhu hover/disabled stanja na ikonama ostaje.
- `card-prose` selektor (paragraph spacing) — nema veze sa bojom.

## Verifikacija nakon implementacije

1. Otvoriti `/subject/:id/cards` → "Pregled" → expand-ovati nekoliko kartica:
   - Dark mode: tekst u expanded prikazu mora imati istu intenzivnost u svakom redu, jednak i `<p>` i goli tekstualni dijelovi.
   - Light mode: importovani DOCX kartice ne smiju prikazivati sivu boju iz originalnog dokumenta.
2. PassiveReader (`subject-cards/PassiveReader.tsx:378`) i dalje koristi `prose dark:prose-invert card-prose` — tu boja sada dolazi iz tokena u oba moda.
3. Pokrenuti postojeće Vitest testove da se ne razbije ništa drugo.

## Datoteke koje se mijenjaju

- `src/components/category/CardViewTable.tsx` (uklanjanje `text-foreground/70` na liniji 166)
- `src/index.css` (novi light-mode prose blok + jačanje dark-mode kontrasta)
