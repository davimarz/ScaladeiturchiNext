export const catalogConfig = {
  haul: { label: "HAUL", field: "haul_url", sourceKey: "haul_source_url", statusKey: "haul_import", countKey: "haul_count", membership: "in_haul", prefix: "haul", url: "https://www.amazon.it/haul/store?ref_=nav_cs_hul_disb" },
  "offerte-lambo": { label: "Offerte Lampo", field: "lambo_url", sourceKey: "offerte_lambo_source_url", statusKey: "lambo_import", countKey: "lambo_count", membership: "in_offerte_lambo", prefix: "lambo", url: "https://www.amazon.it/deals?ref_=nav_cs_gb&bubble-id=deals-collection-lightning-deals" },
  bestseller: { label: "Bestseller", field: "bestseller_url", sourceKey: "bestseller_source_url", statusKey: "bestseller_import", countKey: "bestseller_count", membership: "in_bestseller", prefix: "bestseller", url: "https://www.amazon.it/gp/bestsellers/?ref_=nav_cs_bestsellers" },
} as const;
export type Catalog = keyof typeof catalogConfig;
export function isCatalog(value: unknown): value is Catalog {
  return typeof value === "string" && Object.hasOwn(catalogConfig, value);
}
