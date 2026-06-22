/**
 * Runtime smoke: verify every `app://` asset carries CSP + Content-Type.
 *
 * Invoked via `electron . --verify-headers` after `vite build`.
 */
const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');

const REQUIRED_HEADERS = [
  'content-security-policy',
  'content-type',
];

const EXPECTED_MIME = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.html': 'text/html',
};

function pickDistAssets(distPath) {
  const indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');
  const urls = new Set(['/index.html']);

  const re = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(indexHtml)) !== null) {
    const u = m[1];
    if (u.startsWith('http') || u.startsWith('data:') || u.startsWith('//')) continue;
    urls.add(u.startsWith('/') ? u : '/' + u);
  }

  const fixed = [
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
      const mismatched = [];

      const ext = path.extname(u).toLowerCase();
      const expectedMime = EXPECTED_MIME[ext];
      const actualMime = headers['content-type'] || '';

      if (expectedMime && !actualMime.includes(expectedMime)) {
        mismatched.push(`content-type=${actualMime} (expected ${expectedMime})`);
      }

      const ok = missing.length === 0 && mismatched.length === 0 && res.status === 200;
      if (!ok) failed++;

      results.push({
        url: u,
        status: res.status,
        ok,
        missing,
        mismatched,
        contentType: actualMime || null,
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
