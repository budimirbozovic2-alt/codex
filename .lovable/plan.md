

# Fix: Track picker dropdown u ZenMode-u ne radi

## Problem
`SelectContent` koristi Radix Portal koji renderuje dropdown na document root sa `z-50`. ZenMode panel ima `z-[100]`, pa dropdown pada iza panela i korisnik ne može birati trackove.

## Fix

### Fajl: `src/components/ZenMode.tsx` (1 linija)
Na liniji 281, dodati `className="z-[110]"` na `SelectContent`:

```tsx
<SelectContent className="z-[110]">
```

Ovo osigurava da dropdown bude iznad ZenMode panela.

| Fajl | Promjena |
|------|----------|
| `src/components/ZenMode.tsx` | Dodati `z-[110]` na SelectContent |

## Scope
- 1 fajl, 1 linija

