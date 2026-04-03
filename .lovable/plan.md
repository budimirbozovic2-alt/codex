

# Accessibility audit i performance optimizacije

## A. Accessibility — utvrđeni problemi

### 1. Header dugmad bez `aria-label` (MainLayout.tsx)
4 icon-only dugmeta (Search, Help, Zen, Dark) imaju `title` ali nemaju `aria-label` — screen reader-i ih čitaju kao "button" bez konteksta.

### 2. Skip-to-content link ne postoji
Keyboard korisnici moraju tab-ovati kroz sidebar + header prije dolaska do sadržaja. Potreban je "Preskoči na sadržaj" link.

### 3. Zen mode toggle nema `aria-pressed`
Toggle dugme ne komunicira stanje screen reader-u.

### 4. Fokus trapping u modalima
`GlobalSearch`, `DocxImporter`, `AppOnboarding` koriste shadcn Dialog koji ima ugrađen focus trap — OK. Ali `ZenMode` je custom overlay bez focus trap-a.

### 5. Ostali icon-only buttoni bez labela
~15 instanci u: `MindMapNode.tsx` (⚙, copy), `EdgeSettingsPanel.tsx` (✕), `StructureManagerDialog.tsx` (✓, ✕), `CardContextMenu.tsx` (← Nazad).

## B. Performance — preostalo

### 1. `useMemo` za heavy computations u Dashboard
`DailyBriefing.tsx` i `CoreStats.tsx` računaju statistike na svaki render. Treba memo-izovati sa dependency na `cards`.

### 2. `React.memo` za listu kartica
`CardRow.tsx` je već memo-izovan (prethodni audit). OK.

### 3. Event listener cleanup provjera
MainLayout keyboard handler je čist. OK.

## Plan promjena

### Fajl 1: `MainLayout.tsx` (~10 linija)
- Dodati `aria-label` na sva 4 header dugmeta
- Dodati `aria-pressed={zenMode}` na Zen dugme
- Dodati skip-to-content link ispred header-a
- Dodati `id="main-content"` na `<main>`

### Fajl 2: `src/index.css` (~5 linija)
- Dodati `.sr-only` stil za skip link (prikaže se samo na focus)

### Fajl 3: `MindMapNode.tsx` (~3 linije)
- `aria-label` na settings i copy dugmad

### Fajl 4: `EdgeSettingsPanel.tsx` (~1 linija)
- `aria-label="Zatvori"` na ✕ dugme

### Fajl 5: `ZenMode.tsx` (~5 linija)
- Dodati `role="dialog"` i `aria-modal="true"` na overlay
- Focus trap: auto-focus close dugme pri otvaranju

### Fajl 6: `DailyBriefing.tsx` (~3 linije)
- Wrap heavy compute u `useMemo` sa `[cards]` dependency

## Scope
- 6 fajlova, ~30 linija neto promjena
- Podiže a11y sa ~4/10 na ~7/10
- Nema vizualnih promjena, nema novih zavisnosti

