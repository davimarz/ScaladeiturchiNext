type PriceProduct = {
  current_price: number | null;
  list_price: number | null;
  price_verified_at: string | null;
  discount_percent?: number | null;
};

export function getProductPrice(product: PriceProduct, now: number) {
  const current = product.current_price;
  if (current == null || !Number.isFinite(current) || current <= 0 || !product.price_verified_at) return null;
  const verified = Date.parse(product.price_verified_at);
  if (!Number.isFinite(verified) || !Number.isFinite(now) || verified > now) return null;
  const reference = product.list_price != null && Number.isFinite(product.list_price) && product.list_price > current ? product.list_price : null;
  const savings = reference == null ? null : Math.round((reference - current) / reference * 100);
  const observed = product.discount_percent;
  const discount = savings != null && savings > 0 ? savings
    : product.list_price == null && observed != null && Number.isFinite(observed) && observed > 0 && observed < 100 ? observed : null;
  return {
    current,
    reference,
    discount,
    verifiedAt: product.price_verified_at,
    fresh: now - verified <= 60 * 60 * 1000,
  };
}
