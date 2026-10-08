import "server-only";
import { fetchAmazonProductSnapshot, fetchAmazonSearchTitle, needsProductTitleEnrichment } from "./amazon-page-offer";
import { supabaseAdminFetch } from "./supabase/admin";
import { fetchAmazonProductImagesWithBrowser, fetchAmazonProductSnapshotsWithBrowser, fetchAmazonProductTitlesWithBrowser } from "./haul-browser";
import { isGenericAmazonImage } from "./amazon-input";

async function syncExistingFromAmazonPages(filter = "", limit = 500, prioritizeIncomplete = false) {
  const suffix = filter ? "&" + filter : "";
  const order = prioritizeIncomplete
    ? "&order=price_verified_at.asc.nullsfirst,updated_at.asc"
    : "&order=updated_at.asc";
  const existing = await supabaseAdminFetch<Array<{
    asin: string;
    current_price: number | null;
    list_price: number | null;
    discount_percent: number | null;
    image_url: string | null;
    title: string;
  }>>(
    "products?active=eq.true" + suffix + "&select=asin,current_price,list_price,discount_percent,image_url,title" + order + "&limit=" + Math.max(1, Math.min(limit, 500)),
  );

  let changed = 0;
  let unchanged = 0;
  let failed = 0;
  let imagesRecovered = 0;
  let imagesMissing = 0;

  const weakTitleProducts = existing.filter((product) => needsProductTitleEnrichment(product.title));
  if (weakTitleProducts.length) {
    try {
      const browserTitles = await fetchAmazonProductTitlesWithBrowser(weakTitleProducts.map((product) => product.asin));
      for (let offset = 0; offset < weakTitleProducts.length; offset += 8) {
        const batch = weakTitleProducts.slice(offset, offset + 8);
        await Promise.all(batch.map(async (product) => {
          const title = browserTitles.get(product.asin);
          if (!title || needsProductTitleEnrichment(title)) return;
          product.title = title;
          await supabaseAdminFetch(`products?asin=eq.${encodeURIComponent(product.asin)}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ title, updated_at: new Date().toISOString() }),
          });
        }));
      }
    } catch (error) {
      console.warn("amazon-title-prerepair", error instanceof Error ? error.message : String(error));
    }
  }

  const weakImageProducts = existing.filter((product) => isGenericAmazonImage(product.image_url));
  if (weakImageProducts.length) {
    try {
      const browserImages = await fetchAmazonProductImagesWithBrowser(weakImageProducts.map((product) => product.asin));
      for (let offset = 0; offset < weakImageProducts.length; offset += 8) {
        const batch = weakImageProducts.slice(offset, offset + 8);
        await Promise.all(batch.map(async (product) => {
          const imageUrl = browserImages.get(product.asin);
          if (!imageUrl || isGenericAmazonImage(imageUrl)) return;
          product.image_url = imageUrl;
          imagesRecovered++;
          await supabaseAdminFetch(`products?asin=eq.${encodeURIComponent(product.asin)}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ image_url: imageUrl, updated_at: new Date().toISOString() }),
          });
        }));
      }
    } catch (error) {
      console.warn("amazon-image-prerepair", error instanceof Error ? error.message : String(error));
    }
  }

  for (let offset = 0; offset < existing.length; offset += 12) {
    const batch = existing.slice(offset, offset + 12);
    const results = await Promise.allSettled(
      batch.map(async (product) => {
        let snapshot: Awaited<ReturnType<typeof fetchAmazonProductSnapshot>> | null = null;
        try {
          snapshot = await fetchAmazonProductSnapshot(product.asin);
        } catch {
          snapshot = null;
        }
        const offer = snapshot?.offer ?? null;
        const imageNeedsRepair = isGenericAmazonImage(product.image_url);
        const recoveredImage = imageNeedsRepair && snapshot?.imageUrl && !isGenericAmazonImage(snapshot.imageUrl) ? snapshot.imageUrl : null;
        let recoveredTitle = snapshot?.title && snapshot.title !== product.title ? snapshot.title : null;
        const genericExistingTitle = needsProductTitleEnrichment(product.title);
        if (!recoveredTitle && genericExistingTitle) {
          const searchTitle = await fetchAmazonSearchTitle(product.asin);
          if (searchTitle && searchTitle !== product.title && searchTitle.length > product.title.length) {
            recoveredTitle = searchTitle;
          }
        }

        if (!offer && !recoveredImage && !recoveredTitle) {
          return { status: "failed" as const, imageRecovered: false, imageMissing: isGenericAmazonImage(product.image_url) };
        }

        const hasChanged = offer ? (
          product.current_price !== offer.currentPrice ||
          product.list_price !== offer.listPrice ||
          product.discount_percent !== offer.discountPercent
        ) : false;

        const now = new Date().toISOString();
        const payload: Record<string, unknown> = {};
        if (offer) {
          payload.current_price = offer.currentPrice;
          payload.list_price = offer.listPrice;
          payload.discount_percent = offer.discountPercent;
          payload.currency = offer.currency;
          payload.price_verified_at = now;
        }
        if (recoveredImage) payload.image_url = recoveredImage;
        if (recoveredTitle) payload.title = recoveredTitle;
        if (hasChanged || recoveredImage || recoveredTitle) payload.updated_at = now;

        await supabaseAdminFetch(`products?asin=eq.${encodeURIComponent(product.asin)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(payload),
        });

        return {
          status: offer ? (hasChanged ? "changed" as const : "unchanged" as const) : "failed" as const,
          imageRecovered: Boolean(recoveredImage),
          imageMissing: isGenericAmazonImage(product.image_url) && isGenericAmazonImage(snapshot?.imageUrl),
        };
      }),
    );

    for (const result of results) {
      if (result.status === "rejected") {
        failed++;
        continue;
      }
      if (result.value.status === "changed") changed++;
      else if (result.value.status === "unchanged") unchanged++;
      else failed++;

      if (result.value.imageRecovered) imagesRecovered++;
      if (result.value.imageMissing) imagesMissing++;
    }
  }

  return {
    productsSeen: existing.length,
    productsUpdated: changed,
    productsChanged: changed,
    productsUnchanged: unchanged,
    productsFailed: failed,
    imagesRecovered,
    imagesMissing,
  };
}

export async function syncCatalogPricesByMembership(membership: "haul" | "offerte-lambo" | "bestseller") {
  const filter = membership === "haul"
    ? "in_haul=eq.true"
    : membership === "offerte-lambo"
      ? "in_offerte_lambo=eq.true"
      : "in_bestseller=eq.true";
  return syncExistingFromAmazonPages(filter);
}

export async function syncCatalogBatchByMembership(
  membership: "offerte-lambo" | "bestseller",
  limit = 2,
) {
  const filter = membership === "offerte-lambo"
    ? "in_offerte_lambo=eq.true"
    : "in_bestseller=eq.true";
  return syncExistingFromAmazonPages(filter, limit, true);
}


export async function verifyCatalogProductsBatch(
  membership: "offerte-lambo" | "bestseller",
  limit = 6,
) {
  const isLambo = membership === "offerte-lambo";
  const filter = isLambo ? "in_offerte_lambo=eq.true" : "in_bestseller=eq.true";
  const statusColumn = isLambo ? "lambo_verification_status" : "bestseller_verification_status";
  const attemptsColumn = isLambo ? "lambo_verification_attempts" : "bestseller_verification_attempts";
  const verifiedAtColumn = isLambo ? "lambo_verified_at" : "bestseller_verified_at";
  const errorColumn = isLambo ? "lambo_last_verification_error" : "bestseller_last_verification_error";

  const products = await supabaseAdminFetch<Array<{
    asin: string;
    title: string;
    description: string | null;
    image_url: string | null;
    current_price: number | null;
    list_price: number | null;
    discount_percent: number | null;
    lambo_verified_at: string | null;
    lambo_verification_status: string;
    lambo_verification_attempts: number;
    bestseller_verified_at: string | null;
    bestseller_verification_status: string;
    bestseller_verification_attempts: number;
  }>>(
    "products?active=eq.true&" + filter +
    "&" + statusColumn + "=eq.pending" +
    "&select=asin,title,description,image_url,current_price,list_price,discount_percent,lambo_verified_at,lambo_verification_status,lambo_verification_attempts,bestseller_verified_at,bestseller_verification_status,bestseller_verification_attempts" +
    "&order=" + attemptsColumn + ".asc,updated_at.asc&limit=" + Math.max(1, Math.min(limit, 12)),
  );

  if (!products.length) {
    return { checked: 0, verified: 0, pending: 0, failed: 0 };
  }

  let snapshots = new Map<string, {
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    currentPrice: number | null;
    listPrice: number | null;
    discountPercent: number | null;
    currency: "EUR";
  }>();

  try {
    snapshots = await fetchAmazonProductSnapshotsWithBrowser(products.map((product) => product.asin));
  } catch (error) {
    console.warn("catalog-browser-batch", error instanceof Error ? error.message : String(error));
  }

  // If Chromium fails or Amazon blocks part of the batch, retry each missing ASIN
  // with the lighter direct product-page reader instead of dropping the whole batch.
  for (const product of products) {
    if (snapshots.has(product.asin)) continue;
    try {
      const direct = await fetchAmazonProductSnapshot(product.asin);
      if (direct.title || direct.imageUrl || direct.offer) {
        snapshots.set(product.asin, {
          title: direct.title,
          description: product.description,
          imageUrl: direct.imageUrl,
          currentPrice: direct.offer?.currentPrice ?? null,
          listPrice: direct.offer?.listPrice ?? null,
          discountPercent: direct.offer?.discountPercent ?? null,
          currency: direct.offer?.currency ?? "EUR",
        });
      }
    } catch {
      // The per-product failure is recorded below.
    }
  }
  let verified = 0;
  let pending = 0;
  let failed = 0;

  for (const product of products) {
    const snapshot = snapshots.get(product.asin);
    const now = new Date().toISOString();
    const previousAttempts = isLambo
      ? product.lambo_verification_attempts
      : product.bestseller_verification_attempts;
    const previousVerifiedAt = isLambo
      ? product.lambo_verified_at
      : product.bestseller_verified_at;
    const attempts = (previousAttempts || 0) + 1;

    if (!snapshot) {
      failed++;
      await supabaseAdminFetch(`products?asin=eq.${encodeURIComponent(product.asin)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          [statusColumn]: attempts >= 8 ? "failed" : "pending",
          [attemptsColumn]: attempts,
          [errorColumn]: "Pagina Amazon non leggibile o bloccata",
          updated_at: now,
        }),
      });
      continue;
    }

    const title = snapshot.title && !needsProductTitleEnrichment(snapshot.title)
      ? snapshot.title
      : product.title;
    const description = (snapshot.description || product.description || "").replace(/\s+/g, " ").trim().slice(0, 1400) || null;
    const imageUrl = snapshot.imageUrl && !isGenericAmazonImage(snapshot.imageUrl)
      ? snapshot.imageUrl
      : product.image_url;
    const currentPrice = snapshot.currentPrice ?? product.current_price;
    const listPrice = snapshot.currentPrice != null ? snapshot.listPrice : product.list_price;
    const discountPercent = snapshot.currentPrice != null ? snapshot.discountPercent : product.discount_percent;

    const titleOk = Boolean(title && !needsProductTitleEnrichment(title));
    const imageOk = Boolean(imageUrl && !isGenericAmazonImage(imageUrl));
    const priceOk = currentPrice != null && Number.isFinite(Number(currentPrice)) && Number(currentPrice) > 0 && Number(currentPrice) < 10000;
    const complete = titleOk && imageOk && priceOk;

    const missing = [
      titleOk ? null : "titolo",
      imageOk ? null : "immagine",
      priceOk ? null : "prezzo",
    ].filter(Boolean).join(", ");

    await supabaseAdminFetch(`products?asin=eq.${encodeURIComponent(product.asin)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        title,
        description,
        image_url: imageUrl,
        current_price: currentPrice,
        list_price: listPrice,
        discount_percent: discountPercent,
        currency: snapshot.currency,
        price_verified_at: snapshot.currentPrice != null ? now : undefined,
        [verifiedAtColumn]: complete ? now : previousVerifiedAt,
        [statusColumn]: complete ? "verified" : (attempts >= 8 ? "failed" : "pending"),
        [attemptsColumn]: attempts,
        [errorColumn]: complete ? null : "Dati mancanti: " + missing,
        updated_at: now,
      }),
    });

    if (complete) verified++;
    else if (attempts >= 8) failed++;
    else pending++;
  }

  return { checked: products.length, verified, pending, failed };
}

export async function markCatalogVerificationPending(
  membership: "offerte-lambo" | "bestseller",
) {
  const isLambo = membership === "offerte-lambo";
  const filter = isLambo ? "in_offerte_lambo=eq.true" : "in_bestseller=eq.true";
  const statusColumn = isLambo ? "lambo_verification_status" : "bestseller_verification_status";
  const attemptsColumn = isLambo ? "lambo_verification_attempts" : "bestseller_verification_attempts";
  const errorColumn = isLambo ? "lambo_last_verification_error" : "bestseller_last_verification_error";

  await supabaseAdminFetch("products?active=eq.true&" + filter, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      [statusColumn]: "pending",
      [attemptsColumn]: 0,
      [errorColumn]: null,
    }),
  });
}

