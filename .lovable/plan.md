

# Fix: Remove Forum Atmosphere Blur

## Problem
`ForumAtmosphere.tsx` line 36 applies `backdropFilter: "blur(2px)"` to a **full-screen fixed overlay** (`fixed inset-0`). This blurs everything on the page — monuments, headers, hierarchy labels — except elements rendered above this z-layer.

## Fix

### `src/components/gamification/ForumAtmosphere.tsx`
- **Remove** `backdropFilter: "blur(2px)"` and `WebkitBackdropFilter: "blur(2px)"` from the gradient overlay's inline style (line 36)
- The ambient gradient tint remains — only the blur is removed

One-line change. Everything becomes crystal clear.

