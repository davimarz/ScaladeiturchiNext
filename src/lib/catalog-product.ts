import { isGenericAmazonImage } from "./amazon-input";
import { needsProductTitleEnrichment } from "./amazon-page-offer";

export type CatalogData = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  currentPrice: number | null;
  listPrice: number | null;
  discountPercent: number | null;
};
export function validPrice(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0 && value < 10000;
}
export function cleanDescription(value: string | null | undefined) {
  const text = (value || "").replace(/\s+/g, " ").trim().slice(0, 1400);
  return text.length >= 20 ? text : null;
}
export function missingCatalogData(data: CatalogData) {
  return [
    !data.title || needsProductTitleEnrichment(data.title) ? "titolo" : null,
    isGenericAmazonImage(data.imageUrl) ? "immagine" : null,
    !cleanDescription(data.description) ? "descrizione" : null,
    !validPrice(data.currentPrice) ? "prezzo" : null,
  ].filter((value): value is string => Boolean(value));
}
// Prices form one observation. Never combine a new sale price with an old discount.
export function mergeCatalogData(previous: CatalogData, incoming: Partial<CatalogData>): CatalogData {
  const hasPrice = validPrice(incoming.currentPrice);
  const currentPrice = hasPrice ? incoming.currentPrice! : previous.currentPrice;
  const reference = hasPrice ? incoming.listPrice : previous.listPrice;
  const listPrice = validPrice(reference) && validPrice(currentPrice) && reference > currentPrice ? reference : null;
  const observedDiscount = hasPrice ? incoming.discountPercent : previous.discountPercent;
  const discountPercent = listPrice != null && currentPrice != null
    ? Math.round((listPrice - currentPrice) / listPrice * 100)
    : observedDiscount != null && observedDiscount > 0 && observedDiscount < 100 ? observedDiscount : null;
  return {
    title: incoming.title && !needsProductTitleEnrichment(incoming.title) ? incoming.title : previous.title || incoming.title || null,
    description: cleanDescription(incoming.description) || cleanDescription(previous.description),
    imageUrl: incoming.imageUrl && !isGenericAmazonImage(incoming.imageUrl) ? incoming.imageUrl : previous.imageUrl,
    currentPrice,
    listPrice,
    discountPercent: discountPercent != null && discountPercent > 0 && discountPercent < 100 ? discountPercent : null,
  };
}
