import { NextRequest, NextResponse } from "next/server";
import {
  generateShoppingAnswer,
  mergeProducts,
  searchAmazonCreators,
  searchAmazonFallback,
  searchLocalCatalog,
} from "../../../lib/ai-shopping";
import { searchAmazonViaBrave } from "../../../lib/brave-shopping";
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
    const body = await request.json() as { query?: string };
    query = String(body.query ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
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

    const local = await searchLocalCatalog(query, 8).catch(() => []);
    let products = local;
    const searchInputTokens = 0;
    const searchOutputTokens = 0;
    const searchTotalTokens = 0;
    const searchErrors: string[] = [];

    if (products.length < 4 || products.filter((product) => product.currentPrice != null).length < 4) {
      try {
        const creators = await searchAmazonCreators(query, 8);
        products = mergeProducts(products, creators);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        searchErrors.push("Creators: " + message);
        console.info("ai-shopping-creators-fallback", message);
      }
    }

    if (products.length < 4 || products.filter((product) => product.currentPrice != null).length < 4) {
      try {
        const fallback = await searchAmazonFallback(query, 8);
        products = mergeProducts(products, fallback);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        searchErrors.push("Amazon browser: " + message);
        console.info("ai-shopping-browser-fallback", message);
      }
    }

    if (products.length < 4 || products.filter((product) => product.currentPrice != null).length < 4) {
      try {
        const external = await searchAmazonViaBrave(query, 8);
        products = mergeProducts(products, external);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        searchErrors.push("Brave Search: " + message);
        console.info("ai-shopping-brave-search-fallback", message);
      }
    }

    products = products.slice(0, 8);

    if (!products.length) {
      if (searchTotalTokens > 0) {
        await finalizeAIUsage(usageDay, searchInputTokens, searchOutputTokens, searchTotalTokens);
      } else {
        await releaseAIUsage(usageDay);
      }
      reserved = false;
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

      return NextResponse.json({
        answer: "Non ho trovato prodotti sufficientemente pertinenti per questa richiesta. Prova a specificare meglio cosa cerchi.",
        products: [],
        count: 0,
      });
    }

    const gemini = await generateShoppingAnswer(query, products);
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
