

# Audit v4 Cleanup: 4 Fixes

## Fix 1: `src/lib/sounds.ts:18-27` — Use local `ctx` instead of module-level `audioCtx`
Replace all 8 occurrences of `audioCtx.` inside `playTone` with `ctx.` (lines 18-27). The null guard is already on `ctx`.

## Fix 2: `src/hooks/useDashboardData.ts:90` — Stale appSettings
The `forceSettingsRefresh` counter increments on storage events but `useMemo(() => loadAppSettings(), [])` ignores it. Add the counter to deps:
```ts
const [settingsVersion, forceSettingsRefresh] = useState(0);
const appSettings = useMemo(() => loadAppSettings(), [settingsVersion]);
```

## Fix 3: `src/components/HealthMonitor.tsx:58-65` — Double estimate call
`navigator.storage.estimate()` is called directly on line 60, then again inside `getStorageUsage()` on line 65. Remove the direct call (lines 58-62) and derive `idbEstimate` from the `getStorageUsage()` result:
```ts
const storageResult = await getStorageUsage();
setIdbEstimate({ usage: storageResult.usedBytes, quota: storageResult.maxBytes });
setLsUsage(storageResult);
```

## Fix 4: `src/hooks/useDashboardData.ts:130` — Unnecessary deps
Change `[cards, reviewLog]` to `[]`. `getStorageUsage()` measures browser-level storage, not app state.

## Files changed
| File | Change |
|------|--------|
| `src/lib/sounds.ts` | `audioCtx.` → `ctx.` in playTone (lines 18-27) |
| `src/hooks/useDashboardData.ts` | Expose settingsVersion counter as useMemo dep; change storageUsage deps to `[]` |
| `src/components/HealthMonitor.tsx` | Remove duplicate estimate call, reuse getStorageUsage result |

