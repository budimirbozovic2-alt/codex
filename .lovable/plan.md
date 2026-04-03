
# Autoformat članova u Source Reader-u

## Šta radi
Dugme "Formatiraj članove" u toolbaru koje automatski:
1. Pronalazi sve instance "Član X" (case-insensitive, npr. "Član 1", "član 521")
2. **Bolduje** red sa "Član X"
3. **Bolduje** red/paragraf PRIJE "Član X" (naziv člana)
4. Dodaje vizuelni razmak (margin-top) prije svakog člana za jasno razdvajanje

## Implementacija

### Fajl 1: `src/lib/article-autoformat.ts` (NOVI, ~30 linija)
Utility funkcija `autoFormatArticles(html: string): string`:
- Parsira HTML u DOM (DOMParser)
- Iterira kroz block elemente (p, div, h1-h3)
- Regex: `/^\s*[Čč]lan\s+\d+\.?/i`
- Za svaki match: wrap sadržaj u `<strong>`, dodaj `margin-top: 1.5em`
- Za prethodni sibling element: wrap sadržaj u `<strong>`
- Vrati modificirani HTML string

### Fajl 2: `src/hooks/useSourceReaderActions.ts` (~15 linija)
Nova akcija `handleAutoFormatArticles`:
- Importuje `autoFormatArticles`
- Primijeni na `source.htmlContent`
- Sačuvaj ažurirani izvor (isti pattern kao `persistContent`)
- Toast: "Formatirano X članova"

### Fajl 3: `src/components/source-reader/SourceToolbar.tsx` (~5 linija)
Novo dugme pored "Auto-Split":
- Ikona: `Type` (lucide)
- Label: "Formatiranje"
- Poziva `onAutoFormat` prop

### Fajl 4: `src/components/SourceReader.tsx` (~2 linije)
Proslijediti `onAutoFormat` prop iz actions u SourceToolbar

## Fajlovi
| Fajl | Promjena |
|------|----------|
| `src/lib/article-autoformat.ts` | NOVI — regex + DOM formatiranje |
| `src/hooks/useSourceReaderActions.ts` | Nova akcija handleAutoFormatArticles |
| `src/components/source-reader/SourceToolbar.tsx` | Dugme "Formatiranje" |
| `src/components/SourceReader.tsx` | Wire prop |

## Scope
- 1 novi fajl, 3 modifikovana, ~50 linija neto
