

# Feature: Version Info & Changelog Modal (Easter Egg)

## What exists
The CODEX logo in `TopNav.tsx` already has an `onClick` handler (`_handleBrandClick`) for a hidden system info easter egg (theme toggle sequence). We will add `onDoubleClick` for the new version modal without disturbing that.

## Implementation

### 1. Inject version at build time via `vite.config.ts`
Add a `define` block:
```ts
define: {
  __APP_VERSION__: JSON.stringify(require('./package.json').version),
}
```
Since Vite config uses ESM-ish syntax, we'll use `import` or a synchronous `readFileSync` approach — specifically adding `define: { '__APP_VERSION__': JSON.stringify(process.env.npm_package_version || '1.0.0') }` or reading from `package.json` directly.

### 2. Declare the global in `src/vite-env.d.ts`
```ts
declare const __APP_VERSION__: string;
```

### 3. Modify `src/components/TopNav.tsx`
- Add state: `const [versionOpen, setVersionOpen] = useState(false)`
- Add `onDoubleClick={() => setVersionOpen(true)}` to both desktop and mobile CODEX logo containers (lines 148 and 264)
- Add a second `Dialog` at the bottom (next to the existing `_sysInfoOpen` dialog) with:
  - Title: "System Info & Changelog"
  - Version display: `__APP_VERSION__`
  - Changelog placeholder list
  - Build info (date, environment)

### Files changed
| File | Change |
|------|--------|
| `vite.config.ts` | Add `define` with `__APP_VERSION__` |
| `src/vite-env.d.ts` | Declare `__APP_VERSION__` global |
| `src/components/TopNav.tsx` | Add version dialog + double-click handler |

### Guardrails
- Existing `_handleBrandClick` / theme sequence easter egg — untouched
- No layout changes to `MainLayout.tsx`
- Uses existing `Dialog`, `DialogContent`, `ScrollArea` components (already imported in TopNav)

