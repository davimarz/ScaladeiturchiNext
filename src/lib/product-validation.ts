export const MANUAL_SOURCES = ["manual-amazon-link", "manual-sitestripe-image"] as const;
export const MANUAL_SOURCE_FILTER = "source=in.(manual-amazon-link,manual-sitestripe-image)";
export function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
export function catalogLimit(value: string | null) {
  const n = Number(value ?? 30);
  return Number.isFinite(n) ? Math.min(60, Math.max(1, Math.floor(n))) : 30;
}
