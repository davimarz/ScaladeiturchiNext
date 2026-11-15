'use strict';
const grid = document.getElementById('offerte');
const statusNode = document.getElementById('stato');
const more = document.getElementById('altre');
const search = document.getElementById('cerca');
const category = document.getElementById('categoria');
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const price = value => Number(String(value ?? '').replace(',', '.'));
let manifest, pages, pending, offset, controller, revision = 0, timer;

async function json(file, signal) {
  const response = await fetch('./catalogo/' + file, { signal, ...(file === 'indice.json' ? { cache: 'no-cache' } : {}) });
  if (!response.ok) throw new Error('Catalogo non disponibile');
  return response.json();
}
function element(tag, text, parent) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  parent.append(node);
  return node;
}
function card(item, parent) {
  const article = element('article', '', parent);
  const image = element('img', '', article);
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.src = item.image;
  element('h2', item.name, article);
  element('p', item.merchant, article);
  const value = element('p', '', article);
  element('strong', euro.format(price(item.price)), value);
  const original = price(item.originalPrice);
  if (original > price(item.price)) {
    element('del', euro.format(original), value);
    element('span', ' −' + Math.round(100 * (1 - price(item.price) / original)) + '%', value).className = 'sconto';
  }
  const link = element('a', 'Vedi offerta', article);
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'sponsored noopener noreferrer';
  link.setAttribute('aria-label', 'Vedi offerta: ' + item.name);
}
async function load() {
  const current = revision;
  const signal = controller.signal;
  more.hidden = true;
  statusNode.textContent = 'Caricamento offerte…';
  const terms = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
  const selected = category.value;
  try {
    // Limit each interaction to four blocks, even for a search with no early matches.
    let reads = 0;
    while (pending.length < 24 && offset < pages.length && reads < 4) {
      const rows = await json(pages[offset].file, signal);
      if (revision !== current) return;
      offset++;
      reads++;
      pending.push(...rows.filter(item => (!selected || selected === item.category) &&
        terms.every(term => normalize([item.name, item.brand, item.merchant].join(' ')).includes(term))));
    }
    const fragment = document.createDocumentFragment();
    pending.splice(0, 24).forEach(item => card(item, fragment));
    grid.append(fragment);
    more.hidden = !pending.length && offset >= pages.length;
    more.textContent = grid.children.length ? 'Mostra altre offerte' : 'Cerca nei prossimi prodotti';
    statusNode.textContent = grid.children.length ? grid.children.length + ' offerte mostrate'
      : more.hidden ? (manifest.count ? 'Nessuna offerta corrispondente.' : 'Il catalogo Awin non è stato ancora pubblicato.')
        : 'Nessuna corrispondenza nei prodotti controllati finora.';
  } catch (error) {
    if (revision !== current || signal.aborted) return;
    statusNode.textContent = 'Non è stato possibile caricare le offerte.';
    more.textContent = 'Riprova';
    more.hidden = false;
  }
}
function reset() {
  controller?.abort();
  controller = new AbortController();
  revision++;
  pages = manifest.pages.filter(page => !category.value || page.categories.includes(category.value));
  offset = 0;
  pending = [];
  grid.replaceChildren();
  void load();
}
function start() {
  more.hidden = true;
  json('indice.json').then(data => {
    manifest = data;
    category.replaceChildren(new Option('Tutte le categorie', ''));
    for (const name of data.categories) category.add(new Option(name, name));
    reset();
  }).catch(() => {
    statusNode.textContent = 'Catalogo non disponibile.';
    more.textContent = 'Riprova';
    more.hidden = false;
  });
}
more.addEventListener('click', () => manifest ? load() : start());
category.addEventListener('change', () => { if (manifest) reset(); });
search.addEventListener('input', () => {
  clearTimeout(timer);
  if (manifest) timer = setTimeout(reset, 200);
});
start();
