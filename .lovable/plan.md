

# Plan: Ujednačavanje naslova stranica + uklanjanje kursora

## Tri zahtjeva

### 1. Ikonica iz navigacije uz svaki naslov
Svaka stranica dobija ikonicu koja odgovara navigaciji u sidebar-u:

| Stranica | Nav ikona | Trenutno u naslovu | Akcija |
|---|---|---|---|
| Dashboard | `Home` | nema | dodaj |
| Učenje | `GraduationCap` | nema | dodaj |
| Konsolidacija | `RotateCcw` | nema | dodaj |
| Statistika | `BarChart3` | nema | dodaj |
| Dnevnik | `BookOpen` | nema | dodaj |
| Memorizacija | `Brain` | `Brain` ✅ | OK |
| Strateški planer | `Gauge` | nema | dodaj |
| Speed Reader | `Zap` | nema | dodaj |
| Mentalne mape | `Map` | `Network` ❌ | zamijeni sa `Map` |

### 2. Stil naslova — bijeli bold umjesto zlatnog imperial
Trenutno većina naslova koristi `imperial-title` klasu (zlatna boja, DM Sans 700). Mentalne mape koriste `text-2xl font-bold text-foreground` (bijela boja) — taj stil je upečatljiviji.

Zamjena u svim page-level naslovima:
- `className="imperial-title"` → `className="text-2xl font-bold text-foreground"`
- Dodati `flex items-center gap-2` za ikonu

Fajlovi za izmjenu (10):
- `src/components/Dashboard.tsx` — dodaj naslov "Dashboard" sa `Home` ikonom
- `src/components/learn/ModeSelector.tsx`
- `src/components/review/ReviewSetup.tsx`
- `src/components/MyStats.tsx`
- `src/components/MetacognitiveCenter.tsx`
- `src/components/MnemonicModule.tsx`
- `src/components/StrategicPlanner.tsx`
- `src/components/speed-reader/SpeedReaderSelector.tsx`
- `src/components/mindmap/MindMapList.tsx` — zamijeni `Network` sa `Map`
- `src/views/CategoryView.tsx` — naslov predmeta (zadrži bez nav ikone jer su predmeti dinamički)

`imperial-title` klasa se **NE briše** iz CSS-a jer se koristi i u drugim kontekstima (dijalog naslovi, pod-sekcije itd.).

### 3. Uklanjanje kursora za uređivanje na neaktivnim tekstovima
Dodati u `src/index.css` globalno pravilo:
```css
[contenteditable="false"], .prose:not([contenteditable="true"]) {
  caret-color: transparent;
}
```
I dodatno opšte pravilo za body/main tekst koji nije editable:
```css
body { cursor: default; }
```

## Scope
- ~10 fajlova, svaki sa 1-3 linije izmjene u naslovu
- 1 CSS pravilo za kursor
- Bez destruktivnih promjena

