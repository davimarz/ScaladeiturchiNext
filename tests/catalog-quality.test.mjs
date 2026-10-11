import { usefulTitle } from '../src/lib/catalog-presentation.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { isGenericAmazonImage } from '../src/lib/amazon-input.ts';
function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('../src/lib/' + file + '.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, URL, console, AbortSignal, TextDecoder, setTimeout, clearTimeout, ...globals, process: {arch:"x64",env:{}}, require(name) {
    if (name === 'server-only') return {};
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error('Unexpected import ' + name);
  }});
  return exports;
}
const offer = load('amazon-page-offer', { './catalog-presentation': { usefulTitle }, './amazon-input': { extractAmazonProductImage: () => null } });
const quality = load('catalog-product', { './amazon-input': { isGenericAmazonImage }, './amazon-page-offer': offer });
const config = load('catalog-config');
const good = { title: 'Cuffie bluetooth con microfono', description: 'Cuffie senza fili con microfono e custodia di ricarica.', imageUrl: 'https://m.media-amazon.com/images/I/headphones.jpg', currentPrice: 20, listPrice: 40, discountPercent: 50 };
test('catalogue completeness requires a description and positive price; reference prices are optional', () => {
  assert.equal(quality.missingCatalogData({ ...good, listPrice: null, discountPercent: null }).length, 0);
  assert.ok(quality.missingCatalogData({ ...good, description: null }).includes('descrizione'));
  assert.ok(quality.missingCatalogData({ ...good, currentPrice: 0 }).includes('prezzo'));
  assert.ok(quality.missingCatalogData({ ...good, title: 'La gamma di classi energetiche' }).includes('titolo'));
  assert.equal(quality.cleanDescription('Sedia ergonomica con supporto lombare regolabile. Potrebbe piacerti anche... Aggiungi al carrello'), 'Sedia ergonomica con supporto lombare regolabile.');
});
test('a partial response preserves useful existing data, but a new price never inherits an old discount', () => {
  const retained = quality.mergeCatalogData(good, { title: 'Prodotto Amazon B012345678', imageUrl: null, description: '', currentPrice: null });
  assert.deepEqual(JSON.parse(JSON.stringify(retained)), good);
  const changed = quality.mergeCatalogData(good, { currentPrice: 30 });
  assert.equal(changed.currentPrice, 30); assert.equal(changed.listPrice, null); assert.equal(changed.discountPercent, null);
  const pair = quality.mergeCatalogData(good, { currentPrice: 30, listPrice: 50, discountPercent: 99 });
  assert.equal(pair.discountPercent, 40);
});
test('description extraction includes bullet points and excludes scripts/generic Amazon text', () => {
  const description = offer.extractAmazonProductDescription('<div id="feature-bullets"><ul><li>Microfono integrato e autonomia di 30 ore.</li><li>Compatibile con telefono e computer.</li></ul></div><script>danger()</script>');
  assert.match(description, /Microfono integrato/); assert.match(description, /Compatibile/); assert.doesNotMatch(description, /danger/);
  assert.equal(offer.extractAmazonProductDescription('<meta name="description" content="Acquista online un\'ampia selezione di prodotti Amazon">'), null);
});
test('product pages can recover title and description from nested Product JSON-LD when visible sections are absent', () => {
  const html = '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Robot aspirapolvere Roomba con mappatura","description":"Robot aspirapolvere con navigazione intelligente, mappatura dei locali e svuotamento automatico."}]}</script>';
  assert.equal(offer.extractAmazonProductTitle(html), 'Robot aspirapolvere Roomba con mappatura');
  assert.match(offer.extractAmazonProductDescription(html), /mappatura dei locali/);
});
test('verification persists other products when one page fails and does not mark stale prices as fresh', async () => {
  const rows = [
    { asin: 'B012345678', title: good.title, description: good.description, image_url: good.imageUrl, current_price: 20, list_price: 40, discount_percent: 50, haul_verification_attempts: 2 },
    { asin: 'B087654321', title: good.title, description: null, image_url: good.imageUrl, current_price: null, list_price: null, discount_percent: null, haul_verification_attempts: 0 },
  ];
  const writes = [];
  const sync = load('catalog-sync', {
    './amazon-page-offer': { async fetchAmazonProductSnapshot(asin) { if (asin === rows[0].asin) throw new Error('Unavailable'); return { title: good.title, imageUrl: good.imageUrl, description: good.description, offer: { currentPrice: 12, listPrice: null, discountPercent: null } }; } },
    './haul-browser': { async fetchAmazonProductSnapshotsWithBrowser() { return new Map(); } },
    './supabase/admin': { async supabaseAdminFetch(path, init) { if (!init) return rows; writes.push({ path, body: JSON.parse(init.body) }); } },
    './catalog-config': config, './catalog-product': quality,
  });
  const result = await sync.verifyCatalogProductsBatch('haul');
  assert.equal(result.checked, 2); assert.equal(result.verified, 1); assert.equal(result.failed, 1);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].body.current_price, 20); assert.equal(writes[0].body.price_verified_at, undefined);
  assert.equal(writes[0].body.haul_verification_status, 'failed');
  assert.equal(writes[1].body.description, good.description); assert.equal(writes[1].body.current_price, 12);
  assert.equal(writes[1].body.haul_verification_status, 'verified');
});

test('catalogue pagination returns a continuation without losing different ASIN variants', async () => {
 const exports = {};
 const source = ts.transpileModule(readFileSync(new URL('../src/app/api/catalog/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 const calls = [];
 let fail = false;
 vm.runInNewContext(source, { exports, URL, console, require(name) {
   if (name === 'next/server') return { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } };
   if (name.includes('presented-catalog')) return {getPresentedCatalog:()=>assert.fail('legacy request should preserve pagination')};
   if (name.includes('product-validation')) return { catalogLimit: () => 2 };
   if (name.includes('amazon-page-offer')) return { needsProductTitleEnrichment: () => false };
   if (name.includes('supabase/admin')) return { async supabaseAdminFetch(path) { calls.push(path); if (fail) throw new Error('Database unavailable'); return [ { id:'a', asin:'B012345678', image_url:good.imageUrl }, { id:'b', asin:'B087654321', image_url:good.imageUrl }, { id:'c', asin:'B011111111' } ]; } };
   throw new Error('Unexpected import ' + name);
 }});
 const response = await exports.GET({ nextUrl: new URL('https://example.com/api/catalog?category=offerte-lambo&offset=2') });
 assert.equal(response.body.products.length, 2); assert.equal(response.body.has_more, true); assert.equal(response.body.next_offset, 4);
 assert.match(calls[0], /offset=2/); assert.match(calls[0], /limit=3/); assert.equal(response.body.products[0].image_url, response.body.products[1].image_url);
 fail = true;
 assert.equal((await exports.GET({ nextUrl:new URL('https://example.com/api/catalog') })).status, 503);
});

test('verification summary accounts for catalogues larger than a database response page', async () => {
 const calls=[];
 const sync=load('catalog-sync', {
  './amazon-page-offer':{}, './haul-browser':{}, './catalog-config':config, './catalog-product':quality,
  './supabase/admin':{ async supabaseAdminFetch(path) { calls.push(path); return path.endsWith('offset=0') ? Array.from({length:1000},()=>({status:'verified'})) : [{status:'pending'},{status:'failed'}]; } },
 });
 const result=await sync.catalogVerificationSummary('bestseller');
 assert.equal(result.total,1002);assert.equal(result.complete,1000);assert.equal(result.remaining,1);assert.equal(result.incomplete,1);assert.equal(calls.length,2);
});

test('the admin only offers a retry when that catalogue has pending or failed products', () => {
 const ui=load('catalog-verification',{});
 assert.equal(ui.catalogHasAnomalies({remaining:0,incomplete:0}),false);
 assert.equal(ui.catalogHasAnomalies({remaining:1,incomplete:0}),true);
 assert.equal(ui.catalogHasAnomalies({remaining:0,incomplete:1}),true);
});

test('a browser page failure does not discard successful snapshots from earlier pages', async () => {
 let pages=0,closed=0;
 const browser={ async newPage() {
  if(++pages>3) throw new Error('Browser page unavailable');
  return { async setUserAgent(){},async setExtraHTTPHeaders(){},async goto(){return {status:()=>200};},async waitForSelector(){return null;},async evaluate(){return {...good,currency:'EUR'};},async close(){} };
 },async close(){closed++;},process(){return null;},async disconnect(){} };
 const reader=load('haul-browser',{
  '@sparticuz/chromium-min':{default:{args:[],async executablePath(){return '/tmp/catalog-test-chromium';}}},
  'puppeteer-core':{async launch(){return browser;}},
 });
 const result=await reader.fetchAmazonProductSnapshotsWithBrowser(['B012345678','B087654321','B011111111','B022222222','B033333333','B044444444']);
 assert.equal(result.size,3);assert.equal(result.get('B012345678').currentPrice,20);assert.equal(closed,1);
});

test('catalogue import rejects ASINs found only in recommendation markup', async () => {
 const first = { ...good, asin: 'B012345678', haulCategory: null };
 const recommendation = { ...good, asin: 'B087654321', haulCategory: null };
 const writes = [];
 const importer = load('catalog-import', {
  './supabase/admin': { async supabaseAdminFetch(path, init) {
   if (!init) return [];
   if (path.startsWith('products?on_conflict=')) writes.push(...JSON.parse(init.body));
  } },
  './haul-import': { parseHaulHtml: () => [first, recommendation] },
  './haul-browser': { fetchHaulWithFullScroll: async () => ({ html: 'listing', asins: [first.asin], products: [first] }) },
  './catalog-sync': { markCatalogVerificationPending: async () => {} },
  './catalog-config': config,
  './product-validation': { MANUAL_SOURCES: [] },
  './catalog-product': quality,
 });
 const result = await importer.importCatalog('haul', config.catalogConfig.haul.url);
 assert.equal(result.count, 1);
 assert.deepEqual(writes.map(row => row.asin), [first.asin]);
});

test('catalogue saves a checkpoint before an interrupted browser scan finishes', async () => {
 const product = { ...good, asin: 'B012345678', haulCategory: null };
 const writes = [], events = [];
 const importer = load('catalog-import', {
  './supabase/admin': { async supabaseAdminFetch(path, init) {
   if (!init) return [];
   const rows = JSON.parse(init.body);
   if (path.startsWith('products?on_conflict=')) writes.push(...rows);
   if (path.startsWith('site_settings?')) events.push(...rows);
  } },
  './haul-import': { parseHaulHtml: () => [product] },
  './haul-browser': { async fetchHaulWithFullScroll(url, checkpoint) {
   await checkpoint({ html: 'first page', asins: [product.asin], scrolls: 0 });
   return { html: 'first page', asins: [product.asin], products: [], warning: 'Target closed' };
  } },
  './catalog-sync': { markCatalogVerificationPending: async () => {} },
  './catalog-config': config,
  './product-validation': { MANUAL_SOURCES: [] },
  './catalog-product': quality,
 });
 const result = await importer.importCatalog('haul', config.catalogConfig.haul.url);
 assert.equal(result.status, 'partial');
 assert.equal(result.count, 1);
 assert.equal(writes.length, 2);
 assert.equal(writes[0].haul_verification_status, 'pending');
 assert.equal(events.find(row => row.key === 'haul_last_import').value.status, 'partial');
});

test('catalogue retries the same Amazon listing as HTML after browser HTTP 503', async () => {
 const product = { ...good, asin: 'B012345678', haulCategory: null };
 const writes = [];
 const importer = load('catalog-import', {
  './supabase/admin': { async supabaseAdminFetch(path, init) {
   if (!init) return [];
   if (path.startsWith('products?on_conflict=')) writes.push(...JSON.parse(init.body));
  } },
  './haul-import': { parseHaulHtml: () => [product] },
  './haul-browser': { fetchHaulWithFullScroll: async () => { throw new Error('Amazon browser HTTP 503'); } },
  './catalog-sync': { markCatalogVerificationPending: async () => {} },
  './catalog-config': config,
  './product-validation': { MANUAL_SOURCES: [] },
  './catalog-product': quality,
 }, { fetch: async url => {
  assert.equal(url, config.catalogConfig.haul.url);
  const response = new Response('<div data-asin="B012345678">Cuffie bluetooth</div>', { headers: { 'content-type': 'text/html' } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
 } });
 const result = await importer.importCatalog('haul', config.catalogConfig.haul.url);
 assert.equal(result.status, 'partial');
 assert.equal(result.count, 1);
 assert.deepEqual(writes.map(row => row.asin), [product.asin]);
});
