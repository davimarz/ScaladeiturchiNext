import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") || "").replace(/\s+/g, " ").trim().slice(0, 180);
  if (query.length < 3) {
    return NextResponse.json({ error: "Inserisci almeno tre caratteri per cercare su Amazon." }, { status: 400 });
  }

  const url = new URL("https://www.amazon.it/s");
  url.searchParams.set("k", query);
  url.searchParams.set("tag", process.env.AMAZON_PARTNER_TAG || "eiapromo-21");
  const response = NextResponse.redirect(url, 307);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
