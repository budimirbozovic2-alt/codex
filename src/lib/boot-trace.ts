const _t0 = Date.now();
const _trace: Array<{ step: string; ts: number; meta?: string }> = [];

export function markBootStep(step: string, meta?: string) {
  const entry = { step, ts: Date.now() - _t0, meta };
  _trace.push(entry);
  try {
    console.log(`[boot:${entry.ts}ms] ${step}${meta ? ' — ' + meta : ''}`);
  } catch {}
  try {
    const el = document.getElementById("splash-phase");
    if (el) el.textContent = step;
  } catch {}
  try {
    (window as any).__bootTrace = _trace;
  } catch {}
}

export function getBootTrace() {
  return _trace;
}
