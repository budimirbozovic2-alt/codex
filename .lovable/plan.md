

# Electron Build — Eternal Loading Screen Audit

## Verdict: No eternal loading bug found

The boot sequence has **5 independent timeout layers** that guarantee the UI will eventually show:

```text
Layer 1: useCards.ts forceReady         →  5s → sets ready=true
Layer 2: useCardBootstrap panicTimer    →  8s → sets ready=true
Layer 3: main.tsx hideSplashImmediately →  8s → removes splash DOM
Layer 4: index.html fallback timer     → 10s → shows reload button (with 2 auto-retries)
Layer 5: electron/window.cjs fallback  →  6s → shows BrowserWindow regardless
```

Each layer is **independent** — they use separate timers, not chained promises. Even if React never mounts, layers 4 and 5 still fire.

## Trace of the critical path

1. **Electron main** → creates splash window, creates main window (hidden)
2. **main.tsx** → registers error handlers, starts 8s splash-kill timer, async-imports App, calls `createRoot().render(<App/>)`
3. **App.tsx** → renders `<div data-app-mounted>` immediately (no blocking)
4. **AppContext** → calls `useCards()` → `useCardBootstrap()` → `ensureDbOpen(6000ms)` with timeout
5. **useCardBootstrap finally** → always calls `setReady(true)` + `electronAPI.notifyReady()`
6. **Electron main** receives `renderer-ready` IPC → destroys splash, shows main window

### DB failure path (line 88-97)
If `ensureDbOpen` fails, the `return` on line 97 exits the `try` block but **`finally` still executes** — `setReady(true)` is called, splash is removed, `notifyReady()` fires. The app boots in degraded mode with empty data.

### Dynamic import failure path
If `import("@/lib/boot-trace")` on line 80 throws, the outer `catch` logs it, and `finally` still fires.

## Minor observations (not bugs)

1. **`ready-to-show` timer logic** (window.cjs:205-212): If `ready-to-show` fires before the 6s fallback, it **clears** the fallback and sets a new 3s timer. Net effect: window shows at `ready-to-show + 3.5s` instead of 6s. This is intentional but slightly confusing. Not a bug.

2. **Preload path duplication** (window.cjs:87-89): Both dev and prod branches resolve to the same path. This is correct since `preload.cjs` lives at project root in both cases, but the conditional is dead code.

3. **Service Worker in Electron production**: `sw.js` registration runs in prod (main.tsx:189-201). Under `file://` protocol, service workers don't work. The registration silently fails. Not a loading risk, just a no-op.

## Conclusion

**No code changes needed.** The layered timeout architecture is solid. If an eternal loading screen is actually observed in production, it would have to be caused by:
- A crash loop exceeding the 3-crash limit (which shows an error dialog and quits)
- A hung GPU process (Electron-level, not app-level)
- File corruption where `dist/index.html` is missing (caught by `did-fail-load` handler with 2s retry)

None of these are code bugs — they're environmental failures with existing handlers.

