import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { readCatalogSnapshot, writeCatalogSnapshot } from '../src/lib/catalog-snapshot.ts';

function load(path, dependencies, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, URL, Response, AbortSignal, ...globals,
    require(name) {
      if (name === 'server-only') return {};
      if (dependencies[name]) return dependencies[name];
      throw new Error('Unexpected import ' + name);
    },
  });
  return exports;
}

test('returning to a catalog restores loaded pages without sharing different filters or stale data', () => {
  const data = { products: [{ id: 'one' }, { id: 'two' }], total: 4, incomplete: 0,
    brands: [], has_more: true, next_offset: 2 };
  writeCatalogSnapshot('category=haul&q=scarpe', data, 1000);
  assert.equal(readCatalogSnapshot('category=haul&q=scarpe', 2000), data);
  assert.equal(readCatalogSnapshot('category=bestseller&q=scarpe', 2000), undefined);
  assert.equal(readCatalogSnapshot('category=haul&q=borse', 2000), undefined);
  assert.equal(readCatalogSnapshot('category=haul&q=scarpe', 46000), undefined);
});

test('catalog snapshot memory stays bounded and does not retain oversized browsing sessions', () => {
  const data = { products: [], total: 0, incomplete: 0, brands: [], has_more: false, next_offset: 0 };
  for (let i = 0; i < 13; i++) writeCatalogSnapshot('bounded-' + i, data, 1000);
  assert.equal(readCatalogSnapshot('bounded-0', 1001), undefined);
  assert.equal(readCatalogSnapshot('bounded-12', 1001), data);
  writeCatalogSnapshot('oversized', { ...data, products: Array(301).fill({ id: 'one' }) }, 1000);
  assert.equal(readCatalogSnapshot('oversized', 1001), undefined);
});

test('Amazon redirect is returned before analytics start and analytics failures are contained', async () => {
  const tasks = [];
  const calls = [];
  const route = load('src/app/api/click/[id]/route.ts', {
    'next/server': { after(task) { tasks.push(task); },
      NextResponse: { redirect(url, status) { return new Response(null, { status, headers: { location: String(url) } }); } } },
    '../../../../lib/supabase/admin': { async supabaseAdminFetch(path) {
      calls.push(path);
      if (path === 'affiliate_clicks') throw new Error('Analytics unavailable');
      return [{ id: 'one', affiliate_url: 'https://www.amazon.it/dp/B012345678', active: true }];
    } },
  });
  const response = await route.GET({ url: 'https://site.test/api/click/one' }, { params: Promise.resolve({ id: 'one' }) });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://www.amazon.it/dp/B012345678');
  assert.equal(calls.length, 1);
  assert.equal(tasks.length, 1);
  await tasks[0]();
  assert.equal(calls[1], 'affiliate_clicks');
});

test('cancelled requests propagate cancellation to the Supabase request', async () => {
  let signal;
  const api = load('src/lib/supabase/admin.ts', {
    '../env': { getServerEnv: () => ({ SUPABASE_URL: 'https://database.test', SUPABASE_SECRET_KEY: 'test-key' }) },
  }, { async fetch(url, init) { signal = init.signal; return new Response('[]'); } });
  const controller = new AbortController();
  await api.supabaseAdminFetch('products', { signal: controller.signal });
  assert.equal(signal.aborted, false);
  controller.abort();
  assert.equal(signal.aborted, true);
});
