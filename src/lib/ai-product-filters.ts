import { discountValue, presentable, productBrand } from "./catalog-presentation";

import type { AiSearchProduct } from "./ai-search-session";
import type { StoreProduct } from "./catalog-presentation";

export type AiProductFilters = {
  brand: string;
  min: string;
  max: string;
  sort: string;
  incomplete: boolean;
};

export const defaultAiProductFilters: AiProductFilters = {
  brand: "",
  min: "",
  max: "",
  sort: "default",
  incomplete: false,
};

function asStoreProduct(product: AiSearchProduct): StoreProduct {
  return {
    id: product.asin,
    asin: product.asin,
    title: product.title,
    description: product.description || product.features?.join(" · ") || null,
    image_url: product.imageUrl,
    affiliate_url: product.affiliateUrl,
    current_price: product.currentPrice,
    list_price: product.listPrice,
    discount_percent: product.discountPercent,
    currency: product.currency,
    price_verified_at: product.priceVerifiedAt || null,
  };
}

export function isCompleteAiProduct(product: AiSearchProduct) {
  return presentable(asStoreProduct(product));
}

export function aiProductBrands(products: AiSearchProduct[]) {
  return [...new Set(products.map((product) => productBrand(product.title)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "it"));
}

export function incompleteAiProductCount(products: AiSearchProduct[]) {
  return products.filter((product) => !isCompleteAiProduct(product)).length;
}

export function filterAiProducts(products: AiSearchProduct[], filters: AiProductFilters) {
  const minimum = Number(filters.min);
  const maximum = filters.max ? Number(filters.max) : Infinity;
  const filtered = products.filter((product) =>
    (filters.incomplete || isCompleteAiProduct(product))
    && (!filters.brand || productBrand(product.title).toLowerCase() === filters.brand.toLowerCase())
    && (!(minimum > 0) || (product.currentPrice != null && product.currentPrice >= minimum))
    && (!Number.isFinite(maximum) || (product.currentPrice != null && product.currentPrice <= maximum))
  );

  if (filters.sort === "default") return filtered;
  return filtered
    .map((product, index) => ({ product, index, store: asStoreProduct(product) }))
    .sort((a, b) => {
      let difference = 0;
      if (filters.sort === "price-asc")
        difference = (a.product.currentPrice && a.product.currentPrice > 0 ? a.product.currentPrice : Infinity) - (b.product.currentPrice && b.product.currentPrice > 0 ? b.product.currentPrice : Infinity);
      else if (filters.sort === "price-desc")
        difference = (b.product.currentPrice || 0) - (a.product.currentPrice || 0);
      else if (filters.sort === "discount")
        difference = discountValue(b.store) - discountValue(a.store);
      return (Number.isNaN(difference) ? 0 : difference) || a.index - b.index;
    })
    .map(({ product }) => product);
}
