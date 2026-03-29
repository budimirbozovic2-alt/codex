

# Tier 1 Deep Systemic Audit — Vulnerability & Bottleneck Report

## Triage Table

| Severity | Type | File Path | Description |
|----------|------|-----------|-------------|
| **HIGH** | Security | `src/components/mental-skeleton/LearnModal.tsx:148` | `dangerouslySetInnerHTML={{ __html: section.content }}` — renders card section content **without sanitization**. Content is user-authored HTML from the editor. While the editor sanitizes on input, if IDB data is tampered or imported from a malicious backup, this is a direct XSS vector. |
| **HIGH** | Security | `src/components/category/CardViewMode.tsx:327` | `dangerouslySetInnerHTML={{ __html: section.content }}` — same pattern, renders raw section content without runtime sanitization. |
| **HIGH** | Security | `src/components/source-reader/CoverageArticleList.tsx:82` | `dangerouslySetInnerHTML={{ __html: article.contentHtml }}` — renders parsed article HTML. `contentHtml` comes from `getCoveredSourceArticles` which slices raw `source.htmlContent`. The SourceReader sanitizes on read, but CoverageArticleList gets its data from a separate code path that does **not** sanitize. |
| **HIGH** | Performance | `src/hooks/useCardExport.ts:140` | `idbLoadReviewLog()` (aliased as `loadFullReviewLog`) calls `db.reviewLog.toArray()` — loads the **entire** review log into memory with no limit. After months of daily use (10+ reviews/day × 365 days × multiple sections), this table can reach 50,000+ rows. Full materialization blocks the main thread during export. |
| **HIGH** | Performance | `src/lib/metacognitive-storage.ts:23-27` | `initMetacognitiveCache()` calls `.toArray()` on 5 log tables simultaneously (`diary`, `calibrationLog`, `latencyLog`, `slippageLog`, `activityLog`). All unbounded. These run at **boot time** and block the splash screen. |
| **MODERATE** | Security | `src/components/card-form/EditorSection.tsx:42` | `dangerouslySetInnerHTML={{ __html: p }}` — renders preview paragraphs. The `p` value comes from splitting editor content. While upstream editor sanitizes, this is a defense-in-depth gap. |
| **MODERATE** | Security | `src/components/CardList.tsx:160,177` | `dangerouslySetInnerHTML={{ __html: highlightKeyParts(...) }}` — `highlightKeyParts` does regex replacement on HTML content but does **not** sanitize. If `keyParts` contains crafted strings, the regex could inject markup. Low practical risk since keyParts are user-authored, but violates defense-in-depth. |
| **MODERATE** | Performance | `src/lib/storage.ts:70` | `db.pomodoroLog.toArray()` — unbounded full table read for pomodoro stats. Called from ZenMode on mount. |
| **MODERATE** | Performance | `src/hooks/useCardBootstrap.ts:116-118` | Boot sequence loads `initMetacognitiveCache` + `initPlannerCache` with 3s timeout each. If either table is large, boot stalls at the splash screen until timeout fires. The 8s panic timer is a band-aid. |
| **MODERATE** | Leak | `electron/window.cjs:104-107` | `ipcMain.on('window-minimize/maximize/close')` handlers are registered per `createWindow` call. On crash recovery (which calls `createWindow` again), these accumulate as duplicate listeners. The `removeListener` cleanup on line ~170+ should be verified. |
| **LOW** | Security | `electron/window.cjs:90` | `sandbox: false` in BrowserWindow webPreferences. Required for preload IPC, but weakens the Chromium sandbox. Documented trade-off, not a bug. |
| **LOW** | Performance | `src/lib/planner-storage.ts:58` | `db.disciplineLog.toArray()` — unbounded. Low-volume table (1 entry/day), so practical impact is minimal. |
| **LOW** | Performance | `src/hooks/useCardExport.ts:87,165` | `db.cards.toArray()` called twice in separate export functions. Each call materializes the entire card set. For <10K cards this is acceptable, but could use a shared cache within a single export session. |
| **LOW** | Security | `main.cjs:62` | `ipcMain.handle('log-error')` accepts arbitrary string from renderer and writes to file. No length limit — a compromised renderer could fill disk. |

## Architectural Summary

**Biggest Threat to Scalability: Unbounded `.toArray()` on Log Tables**

The application's "boot-load-all" pattern works well for the `cards` table (<10K records, each needed for filtering). However, the same pattern is applied to **append-only log tables** (`reviewLog`, `calibrationLog`, `latencyLog`, `slippageLog`, `activityLog`, `pomodoroLog`) that grow **without bound**. After 6-12 months of active use:

- `reviewLog` alone could reach 50K-100K entries
- Boot time degrades as `initMetacognitiveCache` materializes all 5 log tables
- Full export blocks the main thread while serializing the entire review history

The fix pattern is consistent: use **time-windowed queries** (e.g., `idbLoadRecentReviewLog(90)` which already exists but isn't used at boot) and **streaming/chunked serialization** for export. The `idbLoadRecentReviewLog` function is already implemented in `db.ts` — it just needs to replace the unbounded calls.

**Second Priority: Runtime Sanitization Gaps**

The codebase has strong input-side sanitization (RichTextEditor, DOCX import, JSON import all pass through `sanitizeHtml`). However, 4 render-side components skip runtime sanitization, relying on the assumption that IDB data is always clean. This violates defense-in-depth — a single corrupted import or direct IDB manipulation bypasses all protections. The fix is trivial: wrap each `dangerouslySetInnerHTML` value in `sanitizeHtml()` via `useMemo`.

