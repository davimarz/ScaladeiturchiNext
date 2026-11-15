import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

test('imports shoes and other categories, compares matching products and preserves the catalog on a failed feed', () => {
  const root = mkdtempSync(join(tmpdir(), 'scala-awin-'));
  try {
    const feeds = join(root, 'feeds');
    mkdirSync(feeds);
    mkdirSync(join(root, 'awin-site'));
    const tool = fileURLToPath(new URL('../tools/awin/importa-listini-awin.cjs', import.meta.url));
    const run = () => spawnSync(process.execPath, [tool, root, feeds, '42'], { encoding: 'utf8' });
    const row = (id, name, category, price, extra = {}) => ({
      product_name: name, merchant_category: category, search_price: price, currency: 'EUR',
      merchant_image_url: 'https://images.example.com/' + id, aw_deep_link: 'https://www.awin1.com/cread.php?a=42&p=' + id, ...extra,
    });
    const records = [
      row(1, 'Sneaker', 'Calzature', '30'),
      row(2, 'Caffettiera', 'Casa', '80', { original_price: '100', ean: '1234567890123' }),
      row(3, 'Caffettiera', 'Casa', '50', { original_price: '100', ean: '1234567890123' }),
      row(4, 'Lampada', 'Casa', '10', { currency: 'USD' }),
    ];
    writeFileSync(join(feeds, 'Partner.jsonl.gz'), gzipSync(records.map(x => JSON.stringify(x)).join('\n')));
    const csv = 'product_name,merchant_category,search_price,currency,merchant_image_url,aw_deep_link\n"Libro, volume uno",Libri,15,EUR,https://images.example.com/5,https://www.awin1.com/cread.php?a=42&p=5\n';
    writeFileSync(join(feeds, 'Libri.csv'), csv);
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const folder = join(root, 'awin-site', 'catalogo');
    const index = readFileSync(join(folder, 'indice.json'), 'utf8');
    const manifest = JSON.parse(index);
    const products = manifest.pages.flatMap(page => JSON.parse(readFileSync(join(folder, page.file), 'utf8')));
    assert.deepEqual(products.map(p => [p.name, p.price]), [['Caffettiera', '50,00'], ['Libro, volume uno', '15,00'], ['Sneaker', '30,00']]);
    assert.deepEqual(manifest.categories, ['Calzature', 'Casa', 'Libri']);
    writeFileSync(join(feeds, 'errore.csv'), 'pagina di errore');
    assert.notEqual(run().status, 0);
    assert.equal(readFileSync(join(folder, 'indice.json'), 'utf8'), index);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
