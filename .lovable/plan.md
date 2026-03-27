

# Phase 2: Sidebar Evolution, Nav Decommissioning & Tabularium

## Overview
Remove standalone "Mapa znanja" from navigation (the hierarchy is now accessed via Forum and will be embedded in a future sidebar). Rename "Registar" tab to "Tabularium". Keep the `/knowledge-map` route alive (deep links) but remove it from all nav menus.

**Note**: The user's request mentions "sidebar evolution with useSourceHierarchy dynamic tree." However, CODEX currently has NO sidebar component — it uses a TopNav with a mega-menu. Building a full collapsible sidebar with live hierarchy tree is a significant new component. This phase will: (1) do the nav cleanup, (2) do the Tabularium rename, and (3) add a collapsible Knowledge Tree panel to the Database page that uses `useSourceHierarchy` — serving as the "live sidebar" for navigating the hierarchy without needing the standalone Knowledge Map page.

## Changes

### 1. TopNav — Remove "Mapa znanja" from Laboratorija menu
**`src/components/TopNav.tsx`**
- Remove `{ path: "/knowledge-map", ... }` from `LAB_ANALYTICS` array (line 34)
- This removes it from both desktop mega-menu and mobile nav

### 2. Breadcrumbs — Keep route label but remove from LAB_ROUTES display
**`src/components/Breadcrumbs.tsx`**
- Keep the `/knowledge-map` entry in route labels (for deep-link breadcrumbs)
- No functional change needed — it just won't appear in nav anymore

### 3. App.tsx — Keep route alive
- No change. The `/knowledge-map` route stays for backward compatibility and direct Forum→KnowledgeMap deep linking.

### 4. DatabasePage — Rename "Registar" to "Tabularium"
**`src/views/DatabasePage.tsx`**
- Change tab label from "Registar" to "Tabularium" (line 98)
- Change icon from `Library` to a `Landmark` icon for the imperial aesthetic
- Keep the tab value as `"registry"` (no logic change)

### 5. SourceManager — Add "Tabularium" header styling
**`src/components/SourceManager.tsx`**
- Add `font-display` (Cinzel) to the component's internal header if it has one
- Add `glass-card` styling to the source list items for visual consistency

### 6. Database Page — Add Knowledge Tree sidebar panel
**`src/views/DatabasePage.tsx`**
- Add a collapsible left panel (using `Collapsible` from radix) that renders a compact hierarchy tree using `useSourceHierarchy`
- The tree shows categories → L1 nodes → L2 nodes with mastery color dots
- Clicking a node navigates to the corresponding filtered view in the Cards tab
- Panel toggled via a small "Atlas" button in the page header
- Uses `glass-card` styling and gold accents consistent with Phase 1

## Files Changed

| File | Change |
|------|--------|
| `src/components/TopNav.tsx` | Remove knowledge-map from LAB_ANALYTICS |
| `src/views/DatabasePage.tsx` | Rename tab to "Tabularium", add Landmark icon, add collapsible knowledge tree panel |
| `src/components/SourceManager.tsx` | Add glass-card styling to source items, font-display header |

## Guardrails
- `/knowledge-map` route kept alive in App.tsx for deep links
- No FSRS math changes
- No source-registry logic changes
- Tab value stays `"registry"` — only the display label changes
- Breadcrumbs still work for `/knowledge-map` if accessed directly

