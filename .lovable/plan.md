

# Edit režim za SourceReader

## Koncept
Dodati toggle dugme "Uredi izvor" u toolbar. Kada je aktivan edit režim:
- Selekcija teksta prikazuje tooltip sa opcijama: H1, H2, H3, Paragraf, Numbered List, Bullet List (umjesto "Napravi esej" / "Poveži sa postojećim")
- Desni klik kontekstni meni ostaje isti (heading opcije)
- Keyboard shortcut `S` u edit režimu primjenjuje formatting umjesto kreiranja eseja
- Exam sidebar mapping je onemogućen
- Ukloniti heading context menu iz režima čitanja (sada je samo u edit režimu)

## Promjene

### 1. SourceReader.tsx — edit mode state + tooltip zamjena
- Dodati `editMode` state (`useState(false)`)
- Proslijediti `editMode` i `setEditMode` u `SourceToolbar`
- **Heading context menu**: prikazivati SAMO kad je `editMode === true`
- **Selection tooltip** (L255-275): zamjena sadržaja ovisno o režimu:
  - **Čitanje**: "Napravi esej" + "Poveži sa postojećim" (kao sada)
  - **Uređivanje**: 6 dugmadi — H1, H2, H3, Paragraf, Numbered List, Bullet List
- Dodati `handleFormatSelection` callback koji:
  1. Uzima Range iz selekcije
  2. Pronalazi parent block element(e) unutar contentRef
  3. Zamijeni tag (h1/h2/h3/p/ol/ul) — ista logika kao `handleSetHeading` ali proširena za liste
  4. Snimi source i pozove `onSourceUpdated`
- Keyboard handler: kad je `editMode` i `selection` postoji, `S` ne poziva `handleConvertToEssay` nego otvara quick format (ili primjenjuje zadnji format)

### 2. SourceToolbar.tsx — dodati "Uredi" dugme
- Novi props: `editMode: boolean`, `setEditMode: (v: boolean) => void`
- Dodati toggle dugme sa ikonom `Pencil` između view mode togglea i width selectora
- Kad je aktivan: `variant="default"`, tekst "Uređivanje" ; kad nije: `variant="outline"`, tekst "Uredi"
- U edit režimu sakriti "Auto-Split" i "Pitanja" dugmad (jer nisu relevantna)

### 3. useSourceLogic.ts — keyboard handler update
- Keyboard handler za `S`: provjeriti da li je `editMode` (proslijediti kao ref ili flag). Ako jeste — ne pozivati `handleConvertToEssay`
- Alternativa: SourceReader sam upravlja keyboard handlerom za edit mode, override-uje logiku iz hook-a

## Formatting logika za liste
Kada korisnik selektuje tekst i klikne "Numbered List" ili "Bullet List":
- Pronađi sve block elemente (`p`, `div`) koji su dio selekcije
- Zamijeni ih sa `<ol><li>...</li></ol>` ili `<ul><li>...</li></ul>`
- Svaki paragraf postaje jedan `<li>`
- Snimi ažurirani HTML

## Fajlovi

| Fajl | Promjena |
|------|----------|
| `src/components/SourceReader.tsx` | editMode state, format tooltip, prošireni handleSetHeading za liste, sakrij heading menu u čitanju |
| `src/components/source-reader/SourceToolbar.tsx` | Novi props + "Uredi" dugme, sakrij Auto-Split/Pitanja u edit modu |
| `src/hooks/useSourceLogic.ts` | Dodati `editMode` ref da keyboard `S` ne triggeruje esej u edit modu |

## Scope
- 3 fajla, ~80 linija promjena

