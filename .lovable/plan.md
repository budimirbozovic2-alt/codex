
## Cilj

Na `SubjectDashboard` premjestiti sekciju **"Prikaz Znanja"** sa vrha na dno — ispod sekcije **"Alati za učenje"**. Trenutni redoslijed:

```text
1. Prikaz Znanja
2. Baza i Izvori znanja
3. Alati za učenje
```

Novi redoslijed:

```text
1. Baza i Izvori znanja
2. Alati za učenje
3. Prikaz Znanja
```

## Šta se mijenja

### `src/views/SubjectDashboard.tsx`

Premiještaju se postojeći `<section>` blokovi bez ikakvih izmjena u sadržaju, stilu ili logici:

- **Prikaz Znanja** (linije 206–256) — premiješta se sa pozicije #1 na poziciju #3 (poslije "Alati za učenje", prije `<MatrixFilterDialog>`).
- **Baza i Izvori znanja** (linije 258–280) i **Alati za učenje** (linije 282–333) ostaju u istom relativnom redoslijedu, ali se pomjeraju iznad "Prikaza Znanja".

Tehnički: jedan `code--line_replace` koji u opsegu 206–333 zamijeni postojeća tri bloka novim redoslijedom.

## Šta se NE mijenja

- Sav sadržaj, klase, ikone, podaci (`subProgressData`, `knowledgeBaseCards`, `coreActions`).
- `MatrixFilterDialog` na dnu fajla.
- Bilo šta van `SubjectDashboard.tsx`.
