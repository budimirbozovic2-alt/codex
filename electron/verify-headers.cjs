/**
 * PR-H-OPFS-FIX-3 (runtime smoke): Headless verification that every asset
 * served from the `app://` protocol carries COOP/COEP/CORP + CSP + correct
 * Content-Type. Invoked via `electron . --verify-headers` from a packaged
 * (or dev-packaged) build that already has `dist/` populated by `vite build`.
 *
 * Exit codes:
 *   0  — all assertions passed; JSON report on stdout
 *   1  — at least one URL missing a required header
 *
 * Does NOT open a BrowserWindow. Uses Electron `net.fetch`, which honors
 * registered custom protocols since Electron 28+.
 */
const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');

const REQUIRED_HEADERS = [
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'content-security-policy',
  'content-type',
];

const EXPECTED_VALUES = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'cross-origin',
};

function pickDistAssets(distPath) {
  const indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');
  const urls = new Set(['/index.html']);

  // <script src="..."> and <link href="...">
  const re = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(indexHtml)) !== null) {
    const u = m[1];
    if (u.startsWith('http') || u.startsWith('data:') || u.startsWith('//')) continue;
    urls.add(u.startsWith('/') ? u : '/' + u);
  }

  // Known fixed assets that MUST be tested even if not referenced from index.html.
  const fixed = [
    '/sqlite/sqlite3.wasm',
    '/fonts/fraunces-latin.woff2',
    '/fonts/fraunces-latin-ext.woff2',
    '/placeholder.svg',
    '/favicon.ico',
  ];
  for (const f of fixed) {
    const onDisk = path.join(distPath, f.replace(/^\//, ''));
    if (fs.existsSync(onDisk)) urls.add(f);
  }
  return [...urls];
}

async function run() {
  const distPath = path.join(__dirname, '..', 'dist');
  if (!fs.existsSync(distPath)) {
    console.error('[verify-headers] dist/ missing — run `vite build` first.');
    app.exit(1);
    return;
  }
  const assets = pickDistAssets(distPath);
  const results = [];
  let failed = 0;

  for (const u of assets) {
    const url = `app://localhost${u}`;
    try {
      const res = await net.fetch(url);
      const headers = {};
      for (const [k, v] of res.headers.entries()) headers[k.toLowerCase()] = v;
      const missing = REQUIRED_HEADERS.filter(h => !(h in headers));
      const mismatched = Object.entries(EXPECTED_VALUES)
        .filter(([k, v]) => headers[k] && headers[k] !== v)
        .map(([k, v]) => `${k}=${headers[k]} (expected ${v})`);
      const ok = missing.length === 0 && mismatched.length === 0 && res.status === 200;
      if (!ok) failed++;
      results.push({
        url: u,
        status: res.status,
        ok,
        missing,
        mismatched,
        contentType: headers['content-type'] || null,
      });
    } catch (err) {
      failed++;
      results.push({ url: u, ok: false, error: String(err && err.message || err) });
    }
  }

  const report = {
    total: results.length,
    failed,
    passed: results.length - failed,
    results,
  };
  console.log(JSON.stringify(report, null, 2));
  app.exit(failed === 0 ? 0 : 1);
}

module.exports = { run };
