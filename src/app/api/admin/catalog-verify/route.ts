import { NextRequest, NextResponse } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../lib/admin-auth";
import { isSameOrigin } from "../../../../lib/admin-request";
import { verifyCatalogProductsBatch, catalogVerificationSummary } from "../../../../lib/catalog-sync";
import { isCatalog } from "../../../../lib/catalog-config";
import { withCatalogJob, CatalogBusyError } from "../../../../lib/catalog-job";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  if (!verifyAdminSessionValue(request.cookies.get(adminCookie.name)?.value)) return NextResponse.json({ ok: false, error: "Sessione non valida" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { catalog?: unknown };
  if (!isCatalog(body.catalog)) return NextResponse.json({ ok: false, error: "Catalogo non valido" }, { status: 400 });
  const catalog = body.catalog;
  try {
    const result = await withCatalogJob(catalog, () => verifyCatalogProductsBatch(catalog, 6));
    const summary = await catalogVerificationSummary(catalog);
    return NextResponse.json({ ok: true, catalog, ...result, ...summary });
  } catch (error) {
    if (error instanceof CatalogBusyError) return NextResponse.json({ ok: false, busy: true, error: error.message }, { status: 409 });
    console.error("catalog-verify", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false, error: "Verifica temporaneamente non disponibile. I dati salvati sono conservati." }, { status: 503 });
  }
}
export async function GET(request: NextRequest) {
  if (!verifyAdminSessionValue(request.cookies.get(adminCookie.name)?.value)) return NextResponse.json({ error: "Sessione non valida" }, { status: 401 });
  const catalog = request.nextUrl.searchParams.get("catalog");
  if (!isCatalog(catalog)) return NextResponse.json({ error: "Catalogo non valido" }, { status: 400 });
  try { return NextResponse.json(await catalogVerificationSummary(catalog), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Stato temporaneamente non disponibile" }, { status: 503 }); }
}
