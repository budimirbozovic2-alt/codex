

# Phase 2.6: Separate "Konsolidacija" and "Učenje" in Sidebar

## Current State
- `AppSidebar.tsx` line 19: `/review` is labeled **"Učenje"** — this is wrong, it should be **"Konsolidacija"**
- `App.tsx` already has both routes: `/review` (ReviewPage) and `/learn` (LearnPage)
- The `/learn` route and `LearnPage` component already exist — no placeholder needed

## Changes

### 1. `src/components/AppSidebar.tsx` — STATIC_NAV (line 17-22)

Update to contain two separate entries:

```ts
import { GraduationCap } from "lucide-react";  // add to imports

const STATIC_NAV = [
  { path: "/", icon: Home, label: "Dashboard" },
  { path: "/review", icon: RotateCcw, label: "Konsolidacija", badge: true },
  { path: "/learn", icon: GraduationCap, label: "Učenje" },
  { path: "/forum", icon: Landmark, label: "Forum" },
  { path: "/settings", icon: SettingsIcon, label: "Podešavanja" },
];
```

- `/review` → **"Konsolidacija"** (FSRS spaced-repetition) with due badge
- `/learn` → **"Učenje"** (3-mode study module: Free, Active, Chain) — new entry with `GraduationCap` icon

### 2. No other files need changes
- `App.tsx` already has both `/review` and `/learn` routes
- `LearnPage` component exists at `src/views/LearnPage.tsx`

## Summary
One-line label fix + one new nav entry in STATIC_NAV. Two distinct features, two distinct sidebar items.

