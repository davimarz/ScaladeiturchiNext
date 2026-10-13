import { NextRequest } from "next/server";
import { handleCatalogImport } from "../../../../../lib/catalog-import-handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  return handleCatalogImport(request, "bestseller");
}
