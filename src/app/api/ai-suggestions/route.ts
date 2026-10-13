import { NextResponse } from "next/server";
import { getMostSearchedQueries } from "../../../lib/ai-shopping";

export const dynamic = "force-dynamic";

export async function GET() {
  const suggestions = await getMostSearchedQueries(4).catch(() => []);
  return NextResponse.json(
    { suggestions },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900" } },
  );
}
