// Loads every built artefact the way a consumer would and runs a short scenario through it.
// Run after `npm run build`; CI does, and then fails if dist/ differs from what is committed.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = (file) => `${root}dist/${file}`;
const require = createRequire(import.meta.url);
const pageUrl = 'https://app.example.com/';
const matomoUrl = 'https://analytics.example.com';

function newPage() {
  return new JSDOM('<!doctype html><title>Orders</title>', { url: pageUrl, runScripts: 'outside-only' });
}

function assertScenario(window, createMatomoTracker) {
  const tracker = createMatomoTracker({ url: matomoUrl, siteId: 7 });
  assert.equal(tracker.enabled, true);

  tracker.identify({ userId: 'u1', dimensions: { 1: 'admin' } });
  tracker.trackPageView({ url: '/orders/5?code=secret#frag' });
  tracker.trackEvent({ category: 'Orders', action: 'Export', name: 'csv' });

  // Round trip through JSON: code evaluated inside the jsdom window builds arrays of that realm.
  const queued = JSON.parse(JSON.stringify(window._paq));
  assert.deepEqual(queued.slice(0, 2), [
    ['setTrackerUrl', `${matomoUrl}/matomo.php`],
    ['setSiteId', 7],
  ]);
  assert.deepEqual(queued.slice(-6), [
    ['setUserId', 'u1'],
    ['setCustomDimension', 1, 'admin'],
    ['setCustomUrl', 'https://app.example.com/orders/5'],
    ['setDocumentTitle', 'Orders'],
    ['trackPageView'],
    ['trackEvent', 'Orders', 'Export', 'csv'],
  ]);
  assert.equal(window.document.querySelectorAll('script[data-nanoco-matomo]').length, 1);
}

async function checkModule(label, load) {
  const { window } = newPage();
  globalThis.window = window;
  globalThis.document = window.document;
  try {
    const exported = await load();
    assert.deepEqual(Object.keys(exported).sort(), ['createMatomoTracker'], `${label} exports`);
    assertScenario(window, exported.createMatomoTracker);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
  console.log(`ok  ${label}`);
}

await checkModule('dist/index.js (ESM)', () => import(pathToFileURL(dist('index.js')).href));
await checkModule('dist/index.cjs (CJS)', async () => require(dist('index.cjs')));
await checkModule('dist/browser.js (self-contained ESM)', () => import(pathToFileURL(dist('browser.js')).href));

const browserSource = readFileSync(dist('browser.js'), 'utf8');
assert.doesNotMatch(browserSource, /\bimport\s*[\w{*"'(]|\brequire\(/, 'dist/browser.js must not import anything');
console.log('ok  dist/browser.js has no imports');

{
  const dom = newPage();
  dom.window.eval(readFileSync(dist('browser.global.js'), 'utf8'));
  assert.deepEqual(Object.keys(dom.window.NanocoMatomo), ['createMatomoTracker']);
  assertScenario(dom.window, dom.window.NanocoMatomo.createMatomoTracker);
  console.log('ok  dist/browser.global.js (window.NanocoMatomo)');
}

for (const [label, load] of [
  ['dist/react.js (ESM)', () => import(pathToFileURL(dist('react.js')).href)],
  ['dist/react.cjs (CJS)', async () => require(dist('react.cjs'))],
]) {
  const exported = await load();
  assert.deepEqual(Object.keys(exported), ['useMatomoPageView'], `${label} exports`);
  assert.equal(typeof exported.useMatomoPageView, 'function');
  console.log(`ok  ${label}`);
}

const manifest = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));
const referencedFiles = new Set();
const collect = (value) => {
  if (typeof value === 'string') referencedFiles.add(value);
  else if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === 'object') Object.values(value).forEach(collect);
};
collect([manifest.main, manifest.module, manifest.types, manifest.exports, manifest.typesVersions]);
for (const file of referencedFiles) {
  assert.ok(existsSync(`${root}${file}`), `package.json points at a missing file: ${file}`);
}
console.log(`ok  package.json references ${referencedFiles.size} files, all present`);
