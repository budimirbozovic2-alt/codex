

## Plan: Dodavanje `frequencyTag` i `sourceType` polja na kartice

### Korak 1 — Dexie schema upgrade (v12)

**`src/lib/db-schema.ts`**
- Dodati `version(12)` sa novim indeksom na `cards` tabeli: dodaje `frequencyTag` i `sourceType` u index string
- Indeksi: `"id, categoryId, subcategoryId, type, createdAt, sourceId, frequencyTag, sourceType, [categoryId+subcategoryId]"`

### Korak 2 — Card TypeScript interfejs

**`src/lib/spaced-repetition.ts`**
- Dodati dva nova opcionalna polja u `Card` interfejs:
  - `frequencyTag?: "često" | "rijetko" | "nikad"`
  - `sourceType?: "skripta" | "zakon"`
- Dodati nove konstante:
  - `FREQUENCY_TAGS` array sa label/value/color za UI selektore
  - `SOURCE_TYPES` array sa label/value za UI selektore

### Korak 3 — useCardActions hook

**`src/hooks/useCardActions.ts`**
- Dodati state: `frequencyTag` i `sourceType` (inicijalizovano iz `editCard` ako postoji)
- Dodati ih u `onUpdate` tip i `handleSubmit` — proslijediti u `onSave`/`onUpdate` pozive
- Eksportovati iz hook return objekta
- Ažurirati `UseCardActionsProps.onSave` i `onUpdate` tipove da uključe nova polja

### Korak 4 — CardForm + MetadataSection UI

**`src/components/card-form/MetadataSection.tsx`**
- Dodati dva nova UI elementa u metadata sekciju:
  1. **"Frekventnost na ispitu"** — `Select` sa 3 opcije: "Često dolazi" / "Rijetko dolazi" / "Gotovo nikad" + opcija "Nije označeno" (prazna vrijednost)
  2. **"Tip izvora"** — `Select` sa 2 opcije: "Skripta" / "Zakon" + opcija "Nije označeno"
- Props: `frequencyTag`, `setFrequencyTag`, `sourceType`, `setSourceType`

**`src/components/CardForm.tsx`**
- Proslijediti nove props iz `a` (useCardActions) u `MetadataSection`

### Korak 5 — Propagacija kroz CRUD

**`src/hooks/useCardCRUD.ts`** (ili gdje se `addCard` implementira)
- Osigurati da `addCard` i `updateCard` primaju i perzistiraju `frequencyTag` i `sourceType`

### Fajlovi

| Fajl | Akcija |
|------|--------|
| `src/lib/db-schema.ts` | +1 verzija (v12), ~3 linije |
| `src/lib/spaced-repetition.ts` | +2 polja u Card, +2 konstante, ~15 linija |
| `src/hooks/useCardActions.ts` | +2 state, ažuriran submit, ~20 linija |
| `src/components/card-form/MetadataSection.tsx` | +2 selektora u UI, ~40 linija |
| `src/components/CardForm.tsx` | Proslijediti 4 nova props, ~4 linije |
| `src/hooks/useCardCRUD.ts` | Prihvatiti nova polja u CRUD, ~5 linija |

**Ukupno: 6 fajlova, ~90 linija. Postojeći podaci ostaju netaknuti — nova polja su opcionalna.**

