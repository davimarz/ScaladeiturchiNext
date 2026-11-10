import type { StoreProduct } from "./catalog-presentation";

export type CatalogSnapshot = {
  products: StoreProduct[];
  total: number;
  incomplete: number;
  brands: string[];
  has_more: boolean;
  next_offset: number;
  truncated?: boolean;
  latest_price_verified_at?: string | null;
};

// Memory only: no search history or catalog data is persisted in browser storage.
const snapshots = new Map<string, { expires: number; data: CatalogSnapshot }>();
const TTL_MS = 45_000;
const MAX_ENTRIES = 12;

export function readCatalogSnapshot(key: string, now = Date.now()): CatalogSnapshot | undefined {
  const entry = snapshots.get(key);
  if (!entry) return undefined;
  if (entry.expires <= now) {
    snapshots.delete(key);
    return undefined;
  }
  return entry.data;
}

export function writeCatalogSnapshot(key: string, data: CatalogSnapshot, now = Date.now()) {
  // Avoid retaining large browsing sessions indefinitely in the tab's memory.
  if (data.products.length > 300) {
    snapshots.delete(key);
    return;
  }
  snapshots.delete(key);
  snapshots.set(key, { expires: now + TTL_MS, data });
  while (snapshots.size > MAX_ENTRIES) snapshots.delete(snapshots.keys().next().value!);
}
