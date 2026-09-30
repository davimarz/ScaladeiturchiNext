import { NextRequest, NextResponse } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../lib/admin-auth";
import { syncAmazonCatalog } from "../../../../lib/catalog-sync";
import { supabaseAdminFetch } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = request.cookies.get(adminCookie.name)?.value;
  if (!verifyAdminSessionValue(session)) {
    return NextResponse.redirect(new URL("/admin?error=session", request.url), 303);
  }

  const started = await supabaseAdminFetch<Array<{ id: number }>>("sync_runs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ source: "admin-manual", status: "running" }),
  });
  const runId = started[0]?.id;

  try {
    const result = await syncAmazonCatalog();
    if (runId) {
      await supabaseAdminFetch(`sync_runs?id=eq.${runId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "success",
          products_seen: result.productsSeen,
          products_updated: result.productsUpdated,
          finished_at: new Date().toISOString(),
        }),
      });
    }
    return NextResponse.redirect(new URL("/admin?sync=success", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    if (runId) {
      await supabaseAdminFetch(`sync_runs?id=eq.${runId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "error",
          error_message: message.slice(0, 1000),
          finished_at: new Date().toISOString(),
        }),
      });
    }
    return NextResponse.redirect(new URL("/admin?sync=error", request.url), 303);
  }
}
