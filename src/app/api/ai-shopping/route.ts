import { NextRequest, NextResponse } from "next/server";
import {
  generateShoppingAnswer,
  mergeProducts,
  searchAmazonCreators,
  searchAmazonFallback,
  searchLocalCatalog,
  enrichMissingProductData,
  interpretShoppingQuery,
} from "../../../lib/ai-shopping";
import { enrichAmazonProductsViaBraveByAsin, searchAmazonViaBrave } from "../../../lib/brave-shopping";
import { isRelevantProduct, isUnrequestedAccessory, maxPriceFromQuery } from "../../../lib/ai-relevance";
import {
  finalizeAIUsage,
  markAIExhausted,
  recordAIQuery,
  releaseAIUsage,
  reserveAIUsage,
} from "../../../lib/ai-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const quotaMessage = "Ciao! Al momento non possiamo elaborare la tua richiesta perché è stato raggiunto il limite di utilizzo gratuito per oggi. Il servizio tornerà disponibile domani. Grazie per la comprensione!";

export async function POST(request: NextRequest) {
  let usageDay = "";
  let query = "";
  let reserved = false;

  try {
    const body = await request.json() as { query?: string; excludeAsins?: string[]; mode?: string };
    query = String(body.query ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
    const mode = body.mode === "more" ? "more" : "search";
    const excludedAsins = new Set(
      (Array.isArray(body.excludeAsins) ? body.excludeAsins : [])
        .map((value) => String(value).trim().toUpperCase())
        .filter((value) => /^[A-Z0-9]{10}$/.test(value))
        .slice(0, 40),
    );
    if (query.length < 3) {
      return NextResponse.json({ error: "Scrivi una richiesta un po’ più precisa." }, { status: 400 });
    }

    const reservation = await reserveAIUsage();
    usageDay = reservation.usageDay;
    reserved = reservation.allowed;

    if (!reservation.allowed) {
      await recordAIQuery({
        usageDay,
        query,
        status: "quota_exhausted",
        errorMessage: "Limite giornaliero interno raggiunto",
      }).catch(() => undefined);

      return NextResponse.json({
        error: quotaMessage,
        quotaExceeded: true,
      }, { status: 429 });
    }

    const TARGET_PRODUCTS = 8;
    const DISCOVERY_TARGET = Math.min(32, TARGET_PRODUCTS + excludedAsins.size);
    const intent = await interpretShoppingQuery(query);
    const semanticQuery = intent.canonicalQuery;
    const searchQueries = intent.searchQueries.slice(0, 3);
    const requestedMaxPrice = maxPriceFromQuery(query);
    const local = await searchLocalCatalog(semanticQuery, DISCOVERY_TARGET).catch(() => []);
    let products = local;
    const searchInputTokens = intent.inputTokens;
    const searchOutputTokens = intent.outputTokens;
    const searchTotalTokens = intent.totalTokens;
    const searchErrors: string[] = [];

    if (products.length < DISCOVERY_TARGET) {
      try {
        for (const candidateQuery of searchQueries) {
          if (products.length >= DISCOVERY_TARGET) break;
          const creators = await searchAmazonCreators(candidateQuery, DISCOVERY_TARGET);
          products = mergeProducts(products, creators);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        searchErrors.push("Creators: " + message);
        console.info("ai-shopping-creators-fallback", message);
      }
    }

    if (products.length < DISCOVERY_TARGET) {
      try {
        for (const candidateQuery of searchQueries) {
          if (products.length >= DISCOVERY_TARGET) break;
          const fallback = await searchAmazonFallback(candidateQuery, DISCOVERY_TARGET);
          products = mergeProducts(products, fallback);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        searchErrors.push("Amazon browser: " + message);
        console.info("ai-shopping-browser-fallback", message);
      }
    }

    if (products.length < DISCOVERY_TARGET) {
      try {
        const external = await searchAmazonViaBrave(semanticQuery, DISCOVERY_TARGET, searchQueries);
        products = mergeProducts(products, external);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        searchErrors.push("Brave Search: " + message);
        console.info("ai-shopping-brave-search-fallback", message);
      }
    }

    products = products
      .filter((product) => !excludedAsins.has(product.asin))
      .filter((product) => isRelevantProduct(product.title, semanticQuery));

    const candidateLimit = Math.min(18, Math.max(TARGET_PRODUCTS * 2, TARGET_PRODUCTS + Math.min(excludedAsins.size, 10)));
    products = products.slice(0, candidateLimit);
    if (mode === "more") products = await enrichAmazonProductsViaBraveByAsin(products);
    products = await enrichMissingProductData(products);

    const plausiblePrices = products
      .map((product) => product.currentPrice)
      .filter((value): value is number => value != null && Number.isFinite(value) && value >= 1 && value <= 9999)
      .sort((a, b) => a - b);
    const medianPrice = plausiblePrices.length
      ? plausiblePrices[Math.floor(plausiblePrices.length / 2)]
      : null;

    products = products
      .filter((product) => !isUnrequestedAccessory(product.title, query))
      .map((product) => {
        const tooHighAbsolute = product.currentPrice != null && product.currentPrice > 9999;
        const tooHighRelative = product.currentPrice != null
          && medianPrice != null
          && plausiblePrices.length >= 2
          && product.currentPrice > Math.max(1000, medianPrice * 8);

        if (!tooHighAbsolute && !tooHighRelative) return product;

        return {
          ...product,
          currentPrice: null,
          listPrice: null,
          discountPercent: null,
        };
      })
      .sort((a, b) => {
        const score = (product: typeof a) =>
          (product.imageUrl ? 3 : 0)
          + (product.currentPrice != null ? 4 : 0)
          + (product.listPrice != null ? 1 : 0)
          + (product.source === "amazon-api" || product.source === "amazon-search" || product.source === "catalogo" ? 1 : 0);
        return score(b) - score(a);
      })
      .filter((product) => product.imageUrl && product.currentPrice != null)
      .filter((product) => requestedMaxPrice == null
        || (product.currentPrice != null && product.currentPrice <= requestedMaxPrice))
      .slice(0, TARGET_PRODUCTS);

    if (!products.length) {
      if (searchTotalTokens > 0) {
        await finalizeAIUsage(usageDay, searchInputTokens, searchOutputTokens, searchTotalTokens);
      } else {
        await releaseAIUsage(usageDay);
      }
      reserved = false;
      if (mode !== "more") {
        await recordAIQuery({
          usageDay,
          query,
          status: "no_products",
          inputTokens: searchInputTokens,
          outputTokens: searchOutputTokens,
          totalTokens: searchTotalTokens,
          productsCount: 0,
          errorMessage: searchErrors.join(" | ") || null,
        }).catch(() => undefined);
      }

      return NextResponse.json({
        answer: "Non ho trovato prodotti sufficientemente pertinenti per questa richiesta. Prova a specificare meglio cosa cerchi.",
        products: [],
        count: 0,
      });
    }

    if (mode === "more") {
      if (searchTotalTokens > 0) {
        await finalizeAIUsage(usageDay, searchInputTokens, searchOutputTokens, searchTotalTokens);
      } else {
        await releaseAIUsage(usageDay);
      }
      reserved = false;
      return NextResponse.json({
        products,
        count: products.length,
      });
    }

    const gemini = await generateShoppingAnswer(semanticQuery, products);
    const inputTokens = searchInputTokens + gemini.inputTokens;
    const outputTokens = searchOutputTokens + gemini.outputTokens;
    const totalTokens = searchTotalTokens + gemini.totalTokens;
    await finalizeAIUsage(usageDay, inputTokens, outputTokens, totalTokens);
    reserved = false;

    await recordAIQuery({
      usageDay,
      query,
      status: "success",
      model: gemini.model,
      inputTokens,
      outputTokens,
      totalTokens,
      productsCount: products.length,
      productAsins: products.map((product) => product.asin),
      productTitles: products.map((product) => product.title),
      productSources: products.map((product) => product.source),
    }).catch(() => undefined);

    return NextResponse.json({
      answer: gemini.text,
      products,
      count: products.length,
    });
  } catch (error) {
    if (reserved && usageDay) {
      await releaseAIUsage(usageDay).catch(() => undefined);
    }

    const statusCode = error instanceof Error && "statusCode" in error
      ? Number((error as Error & { statusCode?: number }).statusCode)
      : 0;
    const providerLimit = statusCode === 429;

    if (providerLimit && usageDay) {
      await markAIExhausted(usageDay).catch(() => undefined);
    }

    if (usageDay && query) {
      await recordAIQuery({
        usageDay,
        query,
        status: providerLimit ? "provider_quota_exhausted" : "error",
        errorMessage: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
    }

    console.error("ask-ai", error instanceof Error ? error.message : error);

    if (providerLimit) {
      return NextResponse.json({ error: quotaMessage, quotaExceeded: true }, { status: 429 });
    }

    return NextResponse.json({ error: "Non sono riuscito a completare la ricerca. Riprova tra poco." }, { status: 500 });
  }
}
