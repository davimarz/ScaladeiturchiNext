import { NextRequest, NextResponse } from "next/server";
import {
  generateShoppingAnswer,
  mergeProducts,
  searchAmazonCreators,
  searchAmazonFallback,
  searchLocalCatalog,
} from "../../../../lib/ai-shopping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { query?: string };
    const query = String(body.query ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
    if (query.length < 3) {
      return NextResponse.json({ error: "Scrivi una richiesta un po’ più precisa." }, { status: 400 });
    }

    const local = await searchLocalCatalog(query, 8).catch(() => []);
    let products = local;

    if (products.length < 4) {
      try {
        const creators = await searchAmazonCreators(query, 8);
        products = mergeProducts(products, creators);
      } catch (error) {
        console.info("ai-shopping-creators-fallback", error instanceof Error ? error.message : String(error));
      }
    }

    if (products.length < 4) {
      try {
        const fallback = await searchAmazonFallback(query, 8);
        products = mergeProducts(products, fallback);
      } catch (error) {
        console.info("ai-shopping-browser-fallback", error instanceof Error ? error.message : String(error));
      }
    }

    products = products.slice(0, 8);
    const answer = await generateShoppingAnswer(query, products);

    return NextResponse.json({
      answer,
      products,
      count: products.length,
    });
  } catch (error) {
    console.error("ask-ai", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Non sono riuscito a completare la ricerca. Riprova tra poco." }, { status: 500 });
  }
}
