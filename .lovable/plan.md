

# Fix: Dugmad minimize/maximize/close uvijek vidljiva

## Problem

U `TitleBar.tsx` (L44), kontrole prozora su umotane u `{api && (...)}` — prikazuju se samo kad postoji `window.electronAPI`. U web preview-u (i van Electron-a) dugmad su potpuno nevidljiva.

## Rješenje

Ukloniti `{api && (...)}` uslov — uvijek renderovati dugmad. U web preview-u, klikovi na `api?.windowMinimize()` su no-op (safe chaining), tako da nema grešaka. Kad se pokrene u Electron-u, dugmad funkcionišu normalno.

| Fajl | Promjena |
|------|----------|
| `src/components/TitleBar.tsx` L44, L68 | Ukloniti `{api && (` wrapper i zatvarajući `)}` — dugmad se uvijek renderuju |

## Scope
- 1 fajl, 2 linije promjena
- Nema novih zavisnosti

