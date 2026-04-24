

## Plan: Adaptivni FSRS — težinski faktori po `frequencyTag`, `sourceType` i `examinerProfile`

Nadograditi FSRS algoritam u `src/lib/spaced-repetition.ts` da prilagođava raspored (interval) i target retention na osnovu kontekstualnih oznaka kartice i profila ispitivača.

### 1. Logika modifikatora — `src/lib/spaced-repetition.ts`

Dodaje se novi helper `computeAdaptiveModifiers(card?, examinerProfile?)` koji vraća dva multiplikatora:

```ts
interface AdaptiveModifiers {
  retentionBoost: number;   // dodaje se na targetRetention (npr. +0.02)
  intervalMultiplier: number; // skraćuje/produžava interval (npr. 0.85 = češće)
}
```

**Pravila** (kumulativno, klampanjem):

| Uslov | retentionBoost | intervalMultiplier |
|------|----------------|--------------------|
| `frequencyTag === "često"` | **+0.03** | **× 0.80** (vidi se češće) |
| `frequencyTag === "rijetko"` | −0.02 | × 1.15 |
| `frequencyTag === "nikad"` | −0.04 | × 1.30 |
| `examinerProfile.preferredAnswerType === "esej"` **AND** `sourceType === "skripta"` | +0.02 | × 0.90 |
| `examinerProfile.preferredAnswerType === "definicija"` **AND** `sourceType === "zakon"` | +0.02 | × 0.90 |
| `examinerProfile.preferredAnswerType === "potpitanja"` (oba tipa boostovana lagano) | +0.01 | × 0.95 |
| `examinerProfile.difficulty === "tezak"` | +0.01 | × 0.95 |
| `examinerProfile.difficulty === "lak"` | −0.01 | × 1.05 |

**Klampovanje rezultata:**
- finalna `targetRetention` ograničena na `[0.80, 0.98]`
- finalni `intervalMultiplier` ograničen na `[0.5, 1.5]`

**Graceful fallback:** ako su `frequencyTag`, `sourceType` i `examinerProfile` svi `undefined`, vraća `{ retentionBoost: 0, intervalMultiplier: 1 }` → identično trenutnoj FSRS putanji (zero-impact regresija).

### 2. Integracija u `calculateNextReview`

Potpis se proširuje **opcionalnim** parametrom da ostane backward-compatible:

```ts
export interface AdaptiveContext {
  frequencyTag?: FrequencyTag;
  sourceType?: CardSourceType;
  examinerProfile?: ExaminerProfile;
}

export function calculateNextReview(
  section: Section,
  grade: number,
  targetRetention?: number,
  ctx?: AdaptiveContext,
): Partial<Section>
```

Unutar funkcije:
- Izračunati `mods = computeAdaptiveModifiers(ctx)`.
- `effectiveRetention = clamp((targetRetention ?? cached) + mods.retentionBoost, 0.80, 0.98)`
- Originalni `interval = calculateInterval(newStability, effectiveRetention)` množi se sa `mods.intervalMultiplier`.
- `finalNextReview` se kalkulisuje iz adjusted intervala.
- Hard-coded grace periods (grade 1 = 20min, novi grade 3/4 = 15/20min) ostaju **netaknuti** — adaptivnost se ne primjenjuje na learning steps, samo na zreli scheduling.

### 3. Pozivaoci — prosljeđivanje konteksta

**`src/hooks/useCardAnnotations.ts`** (`reviewSection`):
- Importovati `loadCategoryRecord` ili koristiti `db.categories.get(c.categoryId)` async **prije** `patchCard` da uzme `examinerProfile`.
- Lakša alternativa (preferirana): cached lookup kroz novi sync helper `getCachedExaminerProfile(categoryId)` koji čita iz module-level mape sinhronizovane preko `eventBus` ili lazy iz IDB pri prvom pozivu (TTL 30s).
- Proslijediti `{ frequencyTag: c.frequencyTag, sourceType: c.sourceType, examinerProfile }` u `calculateNextReview`.

**`src/components/review/ReviewCard.tsx`** (`previewIntervals`):
- Helper `previewIntervals` se proširuje: `previewIntervals(section, ctx?)`.
- ReviewCard već ima pristup `card` — dohvatiti `examinerProfile` iz `useCategoryData()` (kategorije već u contextu) i proslijediti.

### 4. Tipovi i export-i

- Export `AdaptiveContext` i `computeAdaptiveModifiers` iz `spaced-repetition.ts` radi testiranja.
- Re-export `ExaminerProfile` tipa (ili import iz `db-schema`) bez circular dependency (već čisto: `db-schema` ne importuje `spaced-repetition`).

### 5. Testovi — `src/test/spaced-repetition.test.ts`

Nova `describe` grupa `"Adaptive modifiers"`:
- Bez konteksta → identičan rezultat kao trenutni testovi (regression guard).
- `frequencyTag === "često"` → kraći interval u poređenju sa baseline-om (>20% kraće).
- `sourceType === "skripta"` + `preferredAnswerType === "esej"` → boost vs. baseline.
- `sourceType === "zakon"` + `preferredAnswerType === "esej"` → no boost (pravilo se ne primjenjuje).
- Klampovanje retention-a na 0.98 max.

### Fajlovi

| Fajl | Akcija | Linije |
|------|--------|--------|
| `src/lib/spaced-repetition.ts` | +`AdaptiveContext`, +`computeAdaptiveModifiers`, +parametar u `calculateNextReview` i `previewIntervals` | ~70 |
| `src/hooks/useCardAnnotations.ts` | Dohvat `examinerProfile`, prosljeđivanje konteksta | ~25 |
| `src/components/review/ReviewCard.tsx` | Proslijediti `ctx` u `previewIntervals` | ~6 |
| `src/test/spaced-repetition.test.ts` | +5 testova za adaptive modifiers | ~50 |

**4 fajla, ~150 linija. Backward-compatible — bez konteksta algoritam radi identično kao trenutno.**

