

# Sidebar progress indikatori i empty state standardizacija

## 1. Sidebar progress indikatori

### Trenutno stanje
Sidebar prikazuje kategorije samo sa imenom i ikonom. `categoryStats` je već dostupan u kontekstu sa `score` (0-100), `total` i `due` po kategoriji.

### Promjena: `AppSidebar.tsx`
- Importovati `useCategoryData` → `categoryStats` (već importovan)
- Za svaku kategoriju, ispod naziva dodati mini progress bar (2px visine) koji prikazuje `score` procenat
- Boja: zelena za score > 70, žuta za 40-70, crvena za < 40
- U collapsed modu: umjesto bara, prikazati color-coded dot pored ikone
- Dodati `due` badge na kategorije koje imaju dospjele kartice (isti pattern kao Konsolidacija)

### Vizuelni izgled (expanded)
```text
┌──────────────────────┐
│ ⚖ Krivično pravo     │
│ ██████░░░░ 62%       │
│ ⚖ Građansko pravo  3 │
│ █████████░ 89%       │
└──────────────────────┘
```

## 2. Empty state standardizacija

### Trenutno stanje
`EmptyState.tsx` podržava samo `type: "dashboard" | "review"`. Ostale stranice (CardList, Sources, MindMap) koriste ad-hoc inline empty state-ove bez konzistentnog dizajna.

### Promjena: `EmptyState.tsx`
- Proširiti `type` na: `"dashboard" | "review" | "cards" | "sources" | "generic"`
- Svaki tip dobija odgovarajuću ikonu, naslov, opis i opcioni CTA
- Generički tip prima `icon`, `title`, `description` kao props za fleksibilnost
- Zadržati postojeće `dashboard` i `review` varijante nepromijenjene

### Novi props interfejs
```typescript
interface Props {
  type: "dashboard" | "review" | "cards" | "sources" | "generic";
  onAction?: () => void;
  actionLabel?: string;
  diagnostics?: { ... };
  // Za generic tip:
  icon?: LucideIcon;
  title?: string;
  description?: string;
}
```

## Fajlovi

| Fajl | Promjena |
|------|----------|
| `src/components/AppSidebar.tsx` | Dodati mini progress bar + due badge po kategoriji |
| `src/components/EmptyState.tsx` | Proširiti sa novim tipovima, generički mode |

## Scope
- 2 fajla, ~60 linija neto
- Nema novih zavisnosti
- Sidebar progress koristi postojeći `categoryStats` iz konteksta

