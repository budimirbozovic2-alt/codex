

# Fix: TTS Won't Stop — Skips to Next Segment Instead

## Root Cause

When the user clicks pause/stop, `stopTts()` sets `ttsPlayingRef.current = false` and calls `speechSynthesis.cancel()`. However, there's often a **pending `setTimeout`** from a previous `utterance.onend` handler (lines 261, 274) that fires 100ms later and calls `speakSegment()`.

`speakSegment()` never checks `ttsPlayingRef.current` at entry — it immediately starts speaking the next segment, making it appear as though TTS "skipped to the next article" instead of stopping.

## Fix — `src/components/SpeedReader.tsx`

### 1. Guard `speakSegment` entry (line ~204)
Add at the very top of `speakSegment`:
```ts
if (!ttsPlayingRef.current) return;
```
This kills any delayed calls from stale `setTimeout`s.

### 2. Clear pending timeouts in `stopTts`
The 3 `setTimeout(() => speakSegment(...), ...)` calls (lines 215, 227, 261) can still fire after stop. Use a ref to track and cancel them:
- Add `const ttsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);`
- Replace bare `setTimeout(...)` calls with `ttsTimeoutRef.current = setTimeout(...)`
- In `stopTts`, add `if (ttsTimeoutRef.current) { clearTimeout(ttsTimeoutRef.current); ttsTimeoutRef.current = null; }`

### Files changed
| File | Change |
|------|--------|
| `src/components/SpeedReader.tsx` | Add guard at top of `speakSegment`; track + clear pending timeouts in `stopTts` |

### What stays untouched
- TTS WPM mode, voice settings, segment building logic
- No other files changed

