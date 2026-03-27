

# Structural Integrity Audit — Card ↔ Source ↔ Category ↔ Registry

---

## 1. The Card–Source–Category Triangle

**Card schema** (`src/lib/spaced-repetition.ts:67-89`):
- `category: string` — plain text name, NOT a UUID foreign key
- `subcategory?: string` — plain text
- `chapter?: string` — plain text
- `sourceId?: string` — UUID referencing `db.sources.id`

**Source rename stability**: ✅ CONFIRMED SAFE. A Source is linked to a Card via `sourceId` (UUID). Renaming `source.label` in `db.sources` does **not** break the link — the UUID is immutable. The `label` is only used for display and for Registry alias matching.

**Note**: `category` is a raw string, not a foreign key. If a category is renamed in the categories array but cards aren't updated, cards become orphaned. This is handled by `renameCategory` which updates both atomically (fixed in C1 patch).

---

## 2. The Source-to-Registry Bridge

**How it works** (`src/lib/source-registry.ts`):

```
Source (IDB)              Registry (localStorage + IDB backup)
─────────────             ──────────────────────────────────
id: UUID        ←─────    (not used by registry)
label: string   ═════►    SourceAlias.rawLabel → masterSource (Spomenik)
```

- The Registry operates on `Source.label` strings, NOT UUIDs
- `buildAliasMap()` creates `Map<rawLabel, masterSource>`
- `resolveMasterSource(rawLabel, aliasMap)` returns the monument name or falls back to the raw label itself
- ✅ CONFIRMED: Multiple `rawLabel` values can point to the same `masterSource` — this is the core alias mechanism

**Example**:
```
aliases: [
  { rawLabel: "Zakon o upravnom postupku", masterSource: "Upravno pravo" },
  { rawLabel: "Zakon o upravnom sporu",    masterSource: "Upravno pravo" },
]
→ Both laws build the same "Upravno pravo" monument
```

---

## 3. The Registry-to-Forum Command Chain

### Forum level (`forum-logic.ts:237-263`):
- `calculateForumState` groups cards by `card.category` (= monument name in Forum)
- For each category's cards, it resolves `sourceId → source.label → masterSource` via the alias map
- Produces `monument.sources[]` array with per-master-source mastery breakdown
- **Important**: Forum monuments are keyed by `category`, NOT by `masterSource`. The `sources[]` breakdown is metadata for display.

### Interior level (`MonumentInterior.tsx` + `useSourceHierarchy.ts`):

**Mode A ("Grupni") — CONFIRMED** (`useSourceHierarchy.ts:78-89`):
- L1 nodes = Master Source names (resolved via `getCardMasterSource`)
- L2 leaves = Subcategory names
- Cards are grouped by their resolved master source, then by subcategory

**Mode B ("Detaljni") — PARTIALLY CONFIRMED** (`useSourceHierarchy.ts:108-140`):
- L1 nodes = Subcategory names
- L2 leaves = Chapter names (`card.chapter`)
- ⚠️ **Clarification**: Mode B uses `card.chapter` (string field), NOT `card.sections[].id`. The "columns" are chapter names, not section IDs. This is correct for the legal domain (chapters = "Glave" of a law).

### Mode selection (`source-registry.ts:getCategoryDepthMode`):
- Manual `forcedMode` override from `registry.overrides[]` takes precedence
- Auto-detection: ≥2 distinct master sources → A; single source ≥90% dominance → B

---

## 4. Data Integrity Guardrails

### Registry → Forum cache invalidation: ✅ CONFIRMED
```
saveSourceRegistry()
  → _registryCache = registry (immediate)
  → syncSourceRegistryToIDB() (async backup)
  → _notifyRegistry() (event emitter)

RomanForumPage useEffect:
  → onRegistryChanged(() => setRegistryVersion(v+1))
  → registryVersion included in useMemo deps AND in buildFingerprint()
  → calculateForumState cache is busted → full rebuild
```

### Overwrite Import hierarchy preservation: ✅ CONFIRMED
(`useCardImport.ts:86-158`):
- Cards: Old cards deleted from IDB via `bulkDelete(orphanKeys)` ✅
- Categories: Fully replaced on overwrite ✅
- Subcategories: Cleared if backup has none (C3 fix), replaced if present ✅
- Sources: `bulkPut` + orphan deletion on overwrite ✅
- ReviewLog: `db.reviewLog.clear()` + `bulkAdd` on overwrite ✅
- Source Registry: NOT included in export/import payload ⚠️ (self-healing — aliases are rebuilt manually)
- Monument Types: NOT included in export/import ⚠️ (localStorage, self-healing)

---

## 5. System Verdict

### Single Organism Status: ✅ YES, with 2 known blind spots

The four modules form a connected graph:

```text
Card.sourceId (UUID) ──► Source.id (IDB)
Source.label (string) ──► Registry.aliases.rawLabel ──► masterSource (Spomenik)
Card.category (string) ──► Forum monument grouping
Registry.overrides.forcedMode ──► useSourceHierarchy A/B decision
Registry change ──► onRegistryChanged ──► RomanForumPage re-render
```

### Remaining Blind Spots

| # | Area | Risk | Detail |
|---|------|------|--------|
| 1 | Export/Import | ⚠️ LOW | Source Registry aliases and Monument Types are NOT in the backup payload. After an overwrite import on a new device, all alias mappings must be manually recreated. Self-healing but inconvenient. |
| 2 | Category ≠ Spomenik | ⚠️ INFO | Forum monuments are keyed by `card.category`, while the Registry's `masterSource` is a display grouping within a category. If a user expects "Upravno pravo" to be both a category AND a monument name, this works. But if categories and master sources diverge in naming, the Forum shows category names while the interior shows master source names — which is correct but could confuse. |

No critical structural gaps remain. The system is synchronized.

