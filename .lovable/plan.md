

# Mastery progress bar u header predmeta

## Šta se dodaje

Ispod naslova predmeta u `CategoryView` headeru, dodaje se segmentirani progress bar koji vizuelno prikazuje distribuciju kartica po nivoima savladanosti (Novo → Savladano). Svaki segment ima boju odgovarajućeg mastery nivoa i širinu proporcionalnu broju kartica.

## Tehnički detalji

### Fajl: `src/views/CategoryView.tsx`

1. **Import** `getCardMasteryLevel`, `MASTERY_LEVELS` iz `@/lib/mastery`

2. **Novi `useMemo`** — računa distribuciju kartica po mastery nivoima:
   - Iterira kroz `cards`, poziva `getCardMasteryLevel` za svaku
   - Rezultat: `counts[0..5]` — broj kartica po nivou

3. **UI** — ispod postojećeg header diva (L174-184), dodati:
   - Segmentirani progress bar: `h-2 rounded-full overflow-hidden flex bg-secondary`
   - Svaki segment: `div` sa `width: (count/total)*100%` i `backgroundColor` iz `MASTERY_LEVELS[i].color`
   - Ispod bara: kompaktna legenda sa tačkicama boja i brojevima (samo za nivoe koji imaju kartica > 0)
   - Prikazuje se samo ako `cards.length > 0`

### Scope
- 1 fajl, ~25 linija dodato

