

## Plan: Ispravke navigacije ka SubjectDashboard

### Dijagnoza

Sve je ispravno povezano u kodu:
- `ToolCards` je importovan i renderuje se u `Dashboard.tsx` (linija 17 + 109)
- Ruta `/subject/:categoryId` postoji u `App.tsx` (linija 64)
- `CategoryManager` već linkuje na `/subject/${cat}` (linija 142)

**Problem**: Dashboard pokazuje `EmptyState` ("Počnite sa učenjem") jer nema kartica u bazi — `ToolCards` se ne vidi jer je unutar `else` grane koja se renderuje samo kad `cards.length > 0`. Ovo je ispravan ali frustrirajući UX.

**Glavni problem**: Sidebar kategorije (linija 103 u `AppSidebar.tsx`) vode na `/category/${cat.id}` (stari CategoryView), a ne na `/subject/${cat.id}` (novi SubjectDashboard). Korisnik nikad ne vidi SubjectDashboard osim ako ručno navigira na `/categories` rutu.

### Izmjene

**1. `src/components/AppSidebar.tsx` (linija 103)**
- Promijeniti `to={/category/${cat.id}}` → `to={/subject/${cat.id}}`
- Sidebar kategorije sada vode na novi SubjectDashboard
- Stara `/category/:id` ruta ostaje u `App.tsx` (dostupna iz SubjectDashboard-a kroz "Slobodno istraživanje" karticu)

**2. `src/views/DashboardPage.tsx` (linije 32-34)**
- Prikazati `ToolCards` i `QuickActions` čak i kad je `cards.length === 0`, ispod `EmptyState`
- Ovim korisnik vidi "Strateški planer" i "Statistika" dugmad čak i na praznoj bazi

### Šta NE diram

- `SubjectDashboard.tsx` — već funkcionalan
- `App.tsx` rute — sve ispravne
- `CategoryManager.tsx` — već linkuje na `/subject/`
- `Dashboard.tsx` — `ToolCards` komponenta ostaje netaknuta

**Ukupno: 2 fajla, ~5 linija izmjena.**

