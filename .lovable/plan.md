

# Plan: Speed Reader opis + uklanjanje dugmeta "Otvori izvor"

## Izmjena 1: Speed Reader — dodati opis ispod naslova
**Fajl:** `src/components/speed-reader/SpeedReaderSelector.tsx`

Dodati `<p>` tag ispod naslova, kao na ostalim stranicama:
```tsx
<p className="text-muted-foreground text-sm mt-1">Brzo čitanje kartica i izvora — treniraj brzinu i fokus</p>
```

## Izmjena 2: Ukloniti dugme "Otvori izvor" sa Dashboarda
**Fajl:** `src/components/dashboard/QuickActions.tsx`

Ukloniti cijeli blok koji renderuje "Otvori izvor" link (linije 27-33), kao i `lastSourceLabel` prop iz komponente i interfejsa. Ukloniti `BookOpen` import.

Također očistiti `lastSourceLabel` prop gdje god se proslijeđuje u `QuickActions` (vjerovatno u `Dashboard.tsx`).

## Scope
- 2-3 fajla, minimalne izmjene

