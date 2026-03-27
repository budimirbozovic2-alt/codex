

# STEP 2: System Audit & Hardening — Stability Report

## TASK 1: Build & Electron Configuration Audit

### Findings: PASS (no changes needed)

| Area | Status | Detail |
|------|--------|--------|
| `vite.config.ts` base: './' | ✅ OK | Already set correctly (line 3) |
| `package.json` build.files | ✅ OK | Includes dist/**, main.cjs, preload.cjs, electron/**/*.cjs |
| `electron/window.cjs` security | ✅ OK | contextIsolation: true, nodeIntegration: false, sandbox: false |
| Preload path resolution | ✅ OK | Uses path.join(baseDir, 'preload.cjs') |
| `preload.cjs` contextBridge | ✅ OK | Exposes only necessary functions, no raw ipcRenderer |
| `main.cjs` CSP headers | ✅ OK | Applied in production via session.webRequest |
| `src/main.tsx` boot sequence | ✅ OK | React renders first, DB loads async, panicTimer at 8s |
| `useCardBootstrap.ts` panicTimer | ✅ OK | 8s safety net with try-catch DOM manipulation |
| `useCards.ts` forceReady | ✅ OK | 5s secondary safety net |

**No changes required for TASK 1.** The build and Electron configuration is already hardened.

---

## TASK 2: Data & IPC Hardening — Issues Found

### Issue 1: Silent `catch {}` in `src/main.tsx` line 178
The outer Electron IPC setup block has a bare `catch {}`. If the entire backup listener registration fails, it's completely silent.

**Fix:** Add `console.warn` to the catch.

### Issue 2: `as any` cast in `src/main.tsx` line 158
```ts
const api = window.electronAPI as any;
```
This bypasses TypeScript safety. The `ElectronAPI` interface in `electron.d.ts` already defines `onQuitBackupRequested` and `notifyQuitBackupDone`.

**Fix:** Remove `as any`, use `window.electronAPI!` directly (the methods are already in the interface).

### Issue 3: `any[]` types in `src/lib/db.ts` MindMapDoc (lines 21-22)
```ts
nodes: any[];
edges: any[];
```

**Fix:** Define `MindMapNode` and `MindMapEdge` interfaces using the ReactFlow/XYFlow types the app already uses.

### Issue 4: `value: any` in settings Table (line 48) and `idbSaveSettings` (line 408)
```ts
settings!: Table<{ key: string; value: any }, string>;
export async function idbSaveSettings(key: string, value: any): Promise<void>
```

**Assessment:** This is a generic key-value store by design. Replacing `any` with `unknown` is the correct TypeScript improvement — it forces consumers to type-narrow when reading, without restricting what can be stored.

### Issue 5: `(window as any).__bootTrace` in `src/lib/boot-trace.ts` line 15

**Fix:** Extend the Window interface in `electron.d.ts` to include `__bootTrace`.

### Issue 6: FSRS Division-by-Zero Audit
Audited `calculateNextReview`, `getRetrievability`, `calculateInterval`:
- `calculateInterval`: guarded by `if (stability <= 0) return 0` ✅
- `getRetrievability`: guarded by `if (section.stability <= 0) return 0` ✅
- `getCardRetrievability`: divides by `reviewed.length`, guarded by `if (reviewed.length === 0) return 0` ✅
- `getCardScore`: divides by `card.sections.length`, guarded by `if (card.sections.length === 0) return 0` ✅
- `getCategoryStats`: divides by `catCards.length`, guarded by `if (catCards.length === 0)` ✅

**No FSRS changes needed.** All division paths are already guarded.

### Issue 7: Error Boundary Coverage
All route-level pages in `App.tsx` are wrapped. `MyStats`, `Dashboard`, `KnowledgeMap` have compact ErrorBoundary around charts. Coverage is comprehensive.

**No additional ErrorBoundary needed.**

---

## Implementation Plan (5 points)

### Point 1: `src/main.tsx` — Add warn to silent catch + remove `as any`
- Line 158: Replace `const api = window.electronAPI as any` with `const api = window.electronAPI!`
- Line 178: Replace `catch {}` with `catch (e) { console.warn("[boot] Electron IPC setup failed", e); }`

### Point 2: `src/lib/db.ts` — Type MindMapDoc nodes/edges + settings value
- Define `MindMapNode` and `MindMapEdge` interfaces (import Node/Edge types from @xyflow/react or define minimal shape)
- Change `nodes: any[]` → typed, `edges: any[]` → typed
- Change `value: any` → `value: unknown` in settings Table and `idbSaveSettings`

### Point 3: `src/lib/boot-trace.ts` — Remove `as any` window cast
- Extend Window interface in `electron.d.ts` with `__bootTrace`
- Use `(window as Window).__bootTrace` or declare it properly

### Point 4: `src/lib/db.ts` — Replace `err: any` catches with `err: unknown`
- Lines 153, 322, 335: change `catch (err: any)` to `catch (err: unknown)` with proper type narrowing using `(err as Error)?.name` pattern or a type guard

### Point 5: `src/lib/persist-queue.ts` — Replace `err: any` with `err: unknown`
- Line 54: same pattern as Point 4

---

## Guardrails Confirmed (NOT touching)
- panicTimer (8s) and forceReady (5s) — untouched
- FSRS/SM-2 math — audited, no changes needed
- lucide-react deep imports — untouched
- MainLayout max-width — untouched
- Map node snapping — untouched
- Consolidation terminology — untouched
- Info corner & keyboard shortcuts — untouched
- sandbox: false, base: './', electron/**/*.cjs — untouched

## Execution Order (one point per response after approval)
1. Fix `main.tsx` silent catch + remove `as any`
2. Type `MindMapDoc` + settings in `db.ts`
3. Fix `boot-trace.ts` window cast
4. Replace `err: any` in `db.ts`
5. Replace `err: any` in `persist-queue.ts`

